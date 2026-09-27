import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { isBatteryV2LongitudinalProfileMaterializationEnabled } from '@config/battery-health-v2.config';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { getBatteryV2LongitudinalReconciliationIntervalMs } from '@modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/longitudinal/longitudinal-reconciliation.config';
import { LongitudinalReconciliationService } from '@modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/longitudinal/longitudinal-reconciliation.service';

@Injectable()
export class BatteryV2LongitudinalMaterializationReconciliationScheduler {
  private readonly logger = new Logger(
    BatteryV2LongitudinalMaterializationReconciliationScheduler.name,
  );
  private tickInProgress = false;

  constructor(
    private readonly reconciliation: LongitudinalReconciliationService,
    private readonly leaderGuard: SchedulerLeaderGuardService,
  ) {}

  @Interval(getBatteryV2LongitudinalReconciliationIntervalMs())
  async reconcileLongitudinalProfiles(): Promise<void> {
    if (!this.leaderGuard.shouldRun('battery_v2_longitudinal_materialization_reconciliation')) {
      return;
    }
    if (!isBatteryV2LongitudinalProfileMaterializationEnabled()) {
      return;
    }
    if (this.tickInProgress) {
      this.logger.debug('longitudinal_reconciliation_tick_skipped overlap');
      return;
    }

    this.tickInProgress = true;
    try {
      const outcome = await this.reconciliation.runBoundedReconciliationTick();
      if (outcome.status === 'COMPLETED' && outcome.candidateCount > 0) {
        this.logger.log(
          `longitudinal_reconciliation_tick candidates=${outcome.candidateCount} processed=${outcome.processedCount} created=${outcome.createdCount} existing=${outcome.existingCount} d1_rejected=${outcome.d1RejectedCount} d2_rejected=${outcome.d2RejectedCount} errors=${outcome.errorCount}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `longitudinal_reconciliation_tick_failed: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      this.tickInProgress = false;
    }
  }
}
