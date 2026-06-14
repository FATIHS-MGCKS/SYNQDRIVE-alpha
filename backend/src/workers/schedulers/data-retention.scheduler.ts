import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';

/**
 * DataRetentionScheduler
 *
 * Daily housekeeping job that prunes append-only telemetry / polling / log
 * tables which otherwise grow unbounded and cause table bloat. Each table has
 * an independently configurable age window (days); `0` disables retention for
 * that table. Deletes run in bounded batches (by primary key) so locks stay
 * short and a single run can never block the database.
 *
 * Configuration lives in `config/retention.config.ts` (ENV-driven). The master
 * switch `DATA_RETENTION_ENABLED` gates all deletions.
 *
 * This follows the existing `dashboard-insights.repository.ts#pruneOldRuns`
 * pattern (age-based prune of operational rows) generalised across tables.
 */
interface RetentionTarget {
  /** Human label for logs. */
  label: string;
  /** Prisma model delegate (e.g. prisma.dimoPollLog). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any;
  /** Timestamp column used for the age comparison. */
  dateField: string;
  /** Age window in days (0 = disabled). */
  days: number;
}

@Injectable()
export class DataRetentionScheduler implements OnModuleInit {
  private readonly logger = new Logger(DataRetentionScheduler.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const enabled = this.config.get<boolean>('retention.enabled', true);
    const days = this.config.get<Record<string, number>>('retention.days', {});
    const active = Object.entries(days)
      .filter(([, d]) => Number(d) > 0)
      .map(([k, d]) => `${k}=${d}d`);
    this.logger.log(
      `Data retention ${enabled ? 'ENABLED' : 'DISABLED'} — active windows: ${
        active.length ? active.join(', ') : '(none)'
      }`,
    );
  }

  // Daily at 03:30 — offset from trip reconciliation cold repair (03:00).
  @Cron('30 3 * * *')
  async scheduledRun(): Promise<void> {
    await this.runOnce('cron');
  }

  /**
   * Executes one full retention pass across all configured tables.
   * Safe to call manually. Re-entrancy guarded.
   */
  async runOnce(trigger: 'cron' | 'manual' = 'manual'): Promise<{ table: string; deleted: number }[]> {
    if (!this.config.get<boolean>('retention.enabled', true)) {
      this.logger.debug(`Retention disabled (DATA_RETENTION_ENABLED=false) — skipping ${trigger} run.`);
      return [];
    }
    if (this.running) {
      this.logger.warn('Retention run already in progress — skipping overlapping run.');
      return [];
    }

    this.running = true;
    const startedAt = Date.now();
    const results: { table: string; deleted: number }[] = [];

    try {
      const targets = this.buildTargets();
      for (const target of targets) {
        if (target.days <= 0) continue;
        const cutoff = new Date(Date.now() - target.days * 24 * 60 * 60 * 1000);
        try {
          const deleted = await this.pruneByAge(target, cutoff);
          results.push({ table: target.label, deleted });
          if (deleted > 0) {
            this.logger.log(
              `Retention [${target.label}]: deleted ${deleted} row(s) older than ${target.days}d (cutoff ${cutoff.toISOString()}).`,
            );
          }
        } catch (err: unknown) {
          this.logger.error(
            `Retention [${target.label}] failed: ${(err as Error).message}`,
            (err as Error).stack,
          );
        }
      }

      const totalDeleted = results.reduce((acc, r) => acc + r.deleted, 0);
      this.logger.log(
        `Retention ${trigger} run complete — ${totalDeleted} row(s) deleted across ${results.length} table(s) in ${
          Date.now() - startedAt
        }ms.`,
      );
    } finally {
      this.running = false;
    }

    return results;
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private buildTargets(): RetentionTarget[] {
    const d = this.config.get<Record<string, number>>('retention.days', {});
    return [
      { label: 'dimo_poll_logs', model: this.prisma.dimoPollLog, dateField: 'createdAt', days: Number(d.dimoPollLogs ?? 0) },
      { label: 'vehicle_trip_tracking_runs', model: this.prisma.vehicleTripTrackingRun, dateField: 'createdAt', days: Number(d.tripTrackingRuns ?? 0) },
      { label: 'high_mobility_stream_sync_logs', model: this.prisma.highMobilityStreamSyncLog, dateField: 'createdAt', days: Number(d.hmStreamSyncLogs ?? 0) },
      // HighMobilityHealthSyncLog has no createdAt column — uses requestedAt.
      { label: 'high_mobility_health_sync_logs', model: this.prisma.highMobilityHealthSyncLog, dateField: 'requestedAt', days: Number(d.hmHealthSyncLogs ?? 0) },
      { label: 'trip_repairs', model: this.prisma.tripRepair, dateField: 'createdAt', days: Number(d.tripRepairs ?? 0) },
      // RefreshToken: prune tokens that EXPIRED more than N days ago (expiresAt < cutoff).
      { label: 'refresh_tokens', model: this.prisma.refreshToken, dateField: 'expiresAt', days: Number(d.refreshTokens ?? 0) },
      { label: 'activity_logs', model: this.prisma.activityLog, dateField: 'createdAt', days: Number(d.activityLogs ?? 0) },
      { label: 'vehicle_trip_waypoints', model: this.prisma.vehicleTripWaypoint, dateField: 'recordedAt', days: Number(d.tripWaypoints ?? 0) },
      { label: 'tire_health_snapshots', model: this.prisma.tireHealthSnapshot, dateField: 'createdAt', days: Number(d.tireHealthSnapshots ?? 0) },
      { label: 'tire_wear_data_points', model: this.prisma.tireWearDataPoint, dateField: 'createdAt', days: Number(d.tireWearDataPoints ?? 0) },
      { label: 'battery_evidence', model: this.prisma.batteryEvidence, dateField: 'createdAt', days: Number(d.batteryEvidence ?? 0) },
      { label: 'hv_battery_health_snapshots', model: this.prisma.hvBatteryHealthSnapshot, dateField: 'createdAt', days: Number(d.hvBatterySnapshots ?? 0) },
    ];
  }

  /**
   * Deletes rows older than `cutoff` in bounded batches keyed by primary id.
   * Returns the total number of rows deleted.
   */
  private async pruneByAge(target: RetentionTarget, cutoff: Date): Promise<number> {
    const batchSize = this.config.get<number>('retention.batchSize', 5000);
    const maxBatches = this.config.get<number>('retention.maxBatchesPerTable', 500);

    let total = 0;
    for (let i = 0; i < maxBatches; i++) {
      const rows: Array<{ id: string }> = await target.model.findMany({
        where: { [target.dateField]: { lt: cutoff } },
        select: { id: true },
        take: batchSize,
      });
      if (rows.length === 0) break;

      const ids = rows.map((r) => r.id);
      const res = await target.model.deleteMany({ where: { id: { in: ids } } });
      total += res.count ?? 0;

      if (rows.length < batchSize) break;
    }
    return total;
  }
}
