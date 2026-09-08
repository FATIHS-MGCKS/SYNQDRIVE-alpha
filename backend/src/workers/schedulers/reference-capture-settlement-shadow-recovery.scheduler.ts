import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ReferenceCaptureConfig } from '../../modules/vehicle-intelligence/reference-capture/reference-capture.config';
import { ReferenceCaptureSettlementShadowRunnerService } from '../../modules/vehicle-intelligence/reference-capture/reference-capture-settlement-shadow-runner.service';
import { ReferenceCaptureSettlementShadowService } from '../../modules/vehicle-intelligence/reference-capture/reference-capture-settlement-shadow.service';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';

@Injectable()
export class ReferenceCaptureSettlementShadowRecoveryScheduler implements OnModuleInit {
  private readonly logger = new Logger(ReferenceCaptureSettlementShadowRecoveryScheduler.name);

  constructor(
    private readonly config: ReferenceCaptureConfig,
    private readonly runner: ReferenceCaptureSettlementShadowRunnerService,
    private readonly settlementShadowService: ReferenceCaptureSettlementShadowService,
    @Optional() private readonly leaderGuard?: SchedulerLeaderGuardService,
  ) {}

  onModuleInit(): void {
    if (this.config.isSettlementShadowEnabled()) {
      this.logger.log('EXP-021 settlement shadow recovery scheduler active');
    }
  }

  @Interval(60_000)
  async recoverDueShadowSchedules(): Promise<void> {
    if (!this.config.isSettlementShadowEnabled()) return;
    if (this.leaderGuard && !this.leaderGuard.shouldRun('reference_capture_settlement_shadow_recovery')) {
      return;
    }

    const recovered = await this.runner.recoverDueSchedules();
    const wholeTripRecovered = await this.settlementShadowService.recoverWholeTripShadowForPendingExperiments();
    if (recovered > 0) {
      this.logger.log(`Recovered ${recovered} due settlement shadow schedule(s)`);
    }
    if (wholeTripRecovered > 0) {
      this.logger.log(`Recovered whole-trip shadow binding for ${wholeTripRecovered} experiment(s)`);
    }
  }
}
