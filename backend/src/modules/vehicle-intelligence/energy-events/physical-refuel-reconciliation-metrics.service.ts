import { Injectable } from '@nestjs/common';
import { Counter, Gauge } from 'prom-client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  mapRepositoryBacklogToRecoveryReasons,
  PHYSICAL_REFUEL_RECOVERY_BACKLOG_REASONS,
  type PhysicalRefuelRecoveryBacklogCounts,
  type PhysicalRefuelRecoveryRunResult,
} from './physical-refuel-reconciliation-metrics.types';

/**
 * Source-agnostic G2 physical-refuel reconciliation/recovery Prometheus metrics.
 * Registers on the canonical TripMetricsService registry (not RFRF-only).
 */
@Injectable()
export class PhysicalRefuelReconciliationMetricsService {
  readonly recoveryBacklog: Gauge<'reason'>;
  readonly recoveryEnabled: Gauge<string>;
  readonly recoveryRunsTotal: Counter<'result'>;
  readonly recoveryLastSuccessUnixtime: Gauge<string>;
  readonly recoveryRecoveredTotal: Counter<'reason'>;

  constructor(private readonly tripMetrics: TripMetricsService) {
    const register = this.tripMetrics.registry;

    this.recoveryBacklog = new Gauge({
      name: 'synqdrive_physical_refuel_recovery_backlog',
      help: 'Current durable physical-refuel recovery backlog by bounded reason label',
      labelNames: ['reason'],
      registers: [register],
    });

    this.recoveryEnabled = new Gauge({
      name: 'synqdrive_physical_refuel_recovery_enabled',
      help: '1 when G2 physical-refuel recovery is intentionally enabled; 0 when disabled',
      registers: [register],
    });

    this.recoveryRunsTotal = new Counter({
      name: 'synqdrive_physical_refuel_recovery_runs_total',
      help: 'Physical-refuel recovery scheduler tick outcomes (owned by scheduler only)',
      labelNames: ['result'],
      registers: [register],
    });

    this.recoveryLastSuccessUnixtime = new Gauge({
      name: 'synqdrive_physical_refuel_recovery_last_success_unixtime',
      help: 'Unix timestamp of the last successful completed recovery scheduler tick',
      registers: [register],
    });

    this.recoveryRecoveredTotal = new Counter({
      name: 'synqdrive_physical_refuel_recovery_recovered_total',
      help: 'Physical-refuel recovery batch items processed by bounded recovery reason',
      labelNames: ['reason'],
      registers: [register],
    });
  }

  setRecoveryEnabled(enabled: boolean): void {
    this.recoveryEnabled.set(enabled ? 1 : 0);
  }

  setRecoveryBacklogFromRepository(counts: Record<string, number>): void {
    this.setRecoveryBacklog(mapRepositoryBacklogToRecoveryReasons(counts));
  }

  setRecoveryBacklog(counts: PhysicalRefuelRecoveryBacklogCounts): void {
    for (const reason of PHYSICAL_REFUEL_RECOVERY_BACKLOG_REASONS) {
      this.recoveryBacklog.set({ reason }, counts[reason] ?? 0);
    }
  }

  recordRecoveryRun(result: PhysicalRefuelRecoveryRunResult): void {
    this.recoveryRunsTotal.inc({ result });
    if (result === 'success') {
      this.recoveryLastSuccessUnixtime.set(Math.floor(Date.now() / 1000));
    }
  }

  recordRecoveryRecovered(reason: string, count: number): void {
    if (count <= 0) return;
    if (
      !PHYSICAL_REFUEL_RECOVERY_BACKLOG_REASONS.includes(
        reason as (typeof PHYSICAL_REFUEL_RECOVERY_BACKLOG_REASONS)[number],
      )
    ) {
      return;
    }
    this.recoveryRecoveredTotal.inc({ reason }, count);
  }
}
