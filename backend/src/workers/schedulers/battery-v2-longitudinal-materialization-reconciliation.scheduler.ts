import { Injectable, Logger, Optional } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { isBatteryV2LongitudinalProfileMaterializationEnabled } from '@config/battery-health-v2.config';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { getBatteryV2LongitudinalReconciliationIntervalMs } from '@modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/longitudinal/longitudinal-reconciliation.config';
import { LongitudinalReconciliationService } from '@modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/longitudinal/longitudinal-reconciliation.service';
import {
  recordLongitudinalMaterializationFlagEnabledGauge,
  recordLongitudinalReconciliationSchedulerTick,
} from '@modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/longitudinal/longitudinal-reconciliation.metrics';

@Injectable()
export class BatteryV2LongitudinalMaterializationReconciliationScheduler {
  private readonly logger = new Logger(
    BatteryV2LongitudinalMaterializationReconciliationScheduler.name,
  );
  private tickInProgress = false;

  constructor(
    private readonly reconciliation: LongitudinalReconciliationService,
    private readonly leaderGuard: SchedulerLeaderGuardService,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  @Interval(getBatteryV2LongitudinalReconciliationIntervalMs())
  async reconcileLongitudinalProfiles(): Promise<void> {
    const flagEnabled = isBatteryV2LongitudinalProfileMaterializationEnabled();
    recordLongitudinalMaterializationFlagEnabledGauge(this.metrics, flagEnabled);

    if (!this.leaderGuard.shouldRun('battery_v2_longitudinal_materialization_reconciliation')) {
      recordLongitudinalReconciliationSchedulerTick(this.metrics, { result: 'NOT_LEADER' });
      return;
    }
    if (!isBatteryV2LongitudinalProfileMaterializationEnabled()) {
      recordLongitudinalReconciliationSchedulerTick(this.metrics, { result: 'FLAG_OFF' });
      return;
    }
    if (this.tickInProgress) {
      recordLongitudinalReconciliationSchedulerTick(this.metrics, { result: 'OVERLAP' });
      this.logger.debug('longitudinal_reconciliation_tick_skipped overlap');
      return;
    }

    this.tickInProgress = true;
    const started = process.hrtime.bigint();
    try {
      const outcome = await this.reconciliation.runBoundedReconciliationTick();
      const durationSeconds = Number(process.hrtime.bigint() - started) / 1_000_000_000;
      recordLongitudinalReconciliationSchedulerTick(this.metrics, {
        result: 'COMPLETED',
        durationSeconds,
        candidateCount: outcome.candidateCount,
      });
      if (outcome.status === 'COMPLETED' && outcome.candidateCount > 0) {
        this.logger.log(
          `longitudinal_reconciliation_tick candidates=${outcome.candidateCount} processed=${outcome.processedCount} created=${outcome.createdCount} existing=${outcome.existingCount} d1_rejected=${outcome.d1RejectedCount} d2_rejected=${outcome.d2RejectedCount} errors=${outcome.errorCount}`,
        );
      }
    } catch (err) {
      const durationSeconds = Number(process.hrtime.bigint() - started) / 1_000_000_000;
      recordLongitudinalReconciliationSchedulerTick(this.metrics, {
        result: 'FAILED',
        durationSeconds,
      });
      this.logger.warn(
        `longitudinal_reconciliation_tick_failed: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      this.tickInProgress = false;
    }
  }
}
