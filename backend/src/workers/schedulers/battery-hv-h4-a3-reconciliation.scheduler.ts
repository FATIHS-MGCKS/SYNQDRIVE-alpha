import { Injectable, Logger, Optional } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { M3_3HvH4A3ReconciliationService } from '@modules/vehicle-intelligence/battery-health/hv-h4/m3-3-hv-h4-a3-reconciliation.service';
import {
  getBatteryHvH4A3ReconciliationIntervalMs,
  isBatteryHvH4A3ReconciliationEnabled,
} from '@modules/vehicle-intelligence/battery-health/hv-h4/m3-3-hv-h4-a3-reconciliation.config';
import { recordM3_3HvH4A3ReconciliationSchedulerTick } from '@modules/vehicle-intelligence/battery-health/hv-h4/m3-3-hv-h4-a3-reconciliation.metrics';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';

@Injectable()
export class BatteryHvH4A3ReconciliationScheduler {
  private readonly logger = new Logger(BatteryHvH4A3ReconciliationScheduler.name);
  private tickInProgress = false;

  constructor(
    private readonly reconciliation: M3_3HvH4A3ReconciliationService,
    private readonly leaderGuard: SchedulerLeaderGuardService,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  @Interval(getBatteryHvH4A3ReconciliationIntervalMs())
  async reconcileHvH4A3Evidence(): Promise<void> {
    const flagEnabled = isBatteryHvH4A3ReconciliationEnabled();
    if (this.metrics?.batteryHvH4A3ReconciliationFlagEnabled) {
      this.metrics.batteryHvH4A3ReconciliationFlagEnabled.set(flagEnabled ? 1 : 0);
    }

    if (!this.leaderGuard.shouldRun('battery_hv_h4_a3_reconciliation')) {
      recordM3_3HvH4A3ReconciliationSchedulerTick(this.metrics, 'NOT_LEADER');
      return;
    }
    if (!flagEnabled) {
      recordM3_3HvH4A3ReconciliationSchedulerTick(this.metrics, 'FLAG_OFF');
      return;
    }
    if (this.tickInProgress) {
      recordM3_3HvH4A3ReconciliationSchedulerTick(this.metrics, 'OVERLAP');
      this.logger.debug('hv_h4_a3_reconciliation_tick_skipped overlap');
      return;
    }

    this.tickInProgress = true;
    const started = process.hrtime.bigint();
    try {
      const outcome = await this.reconciliation.runBoundedReconciliationTick();
      const durationSeconds = Number(process.hrtime.bigint() - started) / 1_000_000_000;
      if (outcome.result === 'CURSOR_UNAVAILABLE') {
        recordM3_3HvH4A3ReconciliationSchedulerTick(
          this.metrics,
          'CURSOR_UNAVAILABLE',
          durationSeconds,
        );
        return;
      }
      if (outcome.result === 'CURSOR_SAVE_FAILED') {
        recordM3_3HvH4A3ReconciliationSchedulerTick(
          this.metrics,
          'CURSOR_SAVE_FAILED',
          durationSeconds,
        );
        return;
      }
      recordM3_3HvH4A3ReconciliationSchedulerTick(
        this.metrics,
        'COMPLETED',
        durationSeconds,
      );
    } catch (err) {
      const durationSeconds = Number(process.hrtime.bigint() - started) / 1_000_000_000;
      recordM3_3HvH4A3ReconciliationSchedulerTick(this.metrics, 'FAILED', durationSeconds);
      this.logger.warn(
        `hv_h4_a3_reconciliation_tick_failed: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      this.tickInProgress = false;
    }
  }
}
