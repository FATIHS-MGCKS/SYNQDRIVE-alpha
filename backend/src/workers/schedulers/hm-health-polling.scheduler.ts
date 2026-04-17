import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '@shared/database/prisma.service';
import { HmSignalUsageService, HmSignalGroupKey } from '../../modules/high-mobility/high-mobility-signal-usage.service';

/**
 * HM Health Polling Scheduler
 *
 * Polls High Mobility health signals conservatively per signal group cadence:
 *   - SERVICE group:       3x/day — at ~00:00, ~12:00, ~18:00 UTC
 *   - TIRE_PRESSURE group: every 4 hours (6x/day)
 *   - AI_HEALTH_CARE group: every 4 hours (6x/day)
 *
 * Runs a check every 5 minutes; uses lastSuccessAt timestamps to enforce cadence.
 * Only polls vehicles with an active HM_HEALTH data source link.
 *
 * Architecture note: isolated from all business logic — only orchestrates fetches.
 * Never writes to authoritative health engines; delegates entirely to HmSignalUsageService.
 */
@Injectable()
export class HmHealthPollingScheduler {
  private readonly logger = new Logger(HmHealthPollingScheduler.name);

  // Minimum intervals (ms) between fetches per group
  private readonly SERVICE_MIN_INTERVAL_MS = 5 * 60 * 60 * 1000;  // 5 hours
  private readonly PERIODIC_MIN_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

  // Service group target hours (UTC) — poll within 10-minute windows
  private readonly SERVICE_TARGET_HOURS = [0, 12, 18];

  constructor(
    private readonly prisma: PrismaService,
    private readonly signalUsageService: HmSignalUsageService,
  ) {}

  /** Runs every 5 minutes — checks which groups need polling */
  @Interval(5 * 60 * 1000)
  async pollHmHealthSignals(): Promise<void> {
    // Get all vehicles with active HM_HEALTH links
    const activeLinks = await this.prisma.vehicleDataSourceLink.findMany({
      where: {
        sourceType: 'HIGH_MOBILITY',
        sourceSubtype: 'HM_HEALTH',
        isActive: true,
      },
      select: { vehicleId: true, sourceReferenceId: true },
      distinct: ['vehicleId'],
    });

    if (activeLinks.length === 0) return;

    const now = new Date();
    const nowHourUtc = now.getUTCHours();
    const nowMinute = now.getUTCMinutes();

    // Check if we're within a SERVICE polling window (first 10 minutes of target hours)
    const isServiceWindow = this.SERVICE_TARGET_HOURS.some(
      h => nowHourUtc === h && nowMinute < 10
    );

    // Batch-load all signal-group states in a single query instead of doing
    // 3 × N findFirst calls per cycle. For large HM fleets this was an N+1
    // pattern that scaled linearly with vehicle count.
    const vehicleIds = activeLinks.map((l) => l.vehicleId);
    const groups: HmSignalGroupKey[] = ['SERVICE', 'TIRE_PRESSURE', 'AI_HEALTH_CARE'];
    const states = await this.prisma.hmSignalGroupState.findMany({
      where: {
        vehicleId: { in: vehicleIds },
        signalGroup: { in: groups as any[] },
      },
      select: { vehicleId: true, signalGroup: true, lastSuccessAt: true },
    });

    // Key: `${vehicleId}:${group}` → lastSuccessAt (or null if never fetched).
    const stateMap = new Map<string, Date | null>();
    for (const s of states) {
      stateMap.set(
        `${s.vehicleId}:${s.signalGroup as unknown as string}`,
        s.lastSuccessAt,
      );
    }

    const shouldFetch = (
      vehicleId: string,
      group: HmSignalGroupKey,
      minIntervalMs: number,
    ): boolean => {
      const last = stateMap.get(`${vehicleId}:${group}`);
      if (!last) return true; // Never fetched — fetch now
      return Date.now() - last.getTime() >= minIntervalMs;
    };

    let serviceCount = 0;
    let tireCount = 0;
    let aiCount = 0;

    for (const link of activeLinks) {
      const vehicleId = link.vehicleId;

      if (isServiceWindow && shouldFetch(vehicleId, 'SERVICE', this.SERVICE_MIN_INTERVAL_MS)) {
        await this.safeRefresh(vehicleId, 'SERVICE');
        serviceCount++;
      }

      if (shouldFetch(vehicleId, 'TIRE_PRESSURE', this.PERIODIC_MIN_INTERVAL_MS)) {
        await this.safeRefresh(vehicleId, 'TIRE_PRESSURE');
        tireCount++;
      }

      if (shouldFetch(vehicleId, 'AI_HEALTH_CARE', this.PERIODIC_MIN_INTERVAL_MS)) {
        await this.safeRefresh(vehicleId, 'AI_HEALTH_CARE');
        aiCount++;
      }
    }

    if (serviceCount + tireCount + aiCount > 0) {
      this.logger.log(
        `HM polling cycle: SERVICE=${serviceCount}, TIRE_PRESSURE=${tireCount}, AI_HEALTH_CARE=${aiCount} vehicles`
      );
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async safeRefresh(vehicleId: string, group: HmSignalGroupKey): Promise<void> {
    try {
      await this.signalUsageService.refreshSignalGroup(vehicleId, group);
    } catch (err: any) {
      this.logger.warn(`HM polling error for vehicle ${vehicleId} [${group}]: ${err?.message}`);
    }
  }
}
