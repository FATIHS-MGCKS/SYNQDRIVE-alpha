import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ReferenceCaptureConfig } from '../../modules/vehicle-intelligence/reference-capture/reference-capture.config';
import { ReferenceCaptureExp021MaturationShadowRunnerService } from '../../modules/vehicle-intelligence/reference-capture/exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-runner.service';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';

@Injectable()
export class ReferenceCaptureExp021MaturationShadowRecoveryScheduler implements OnModuleInit {
  private readonly logger = new Logger(ReferenceCaptureExp021MaturationShadowRecoveryScheduler.name);

  constructor(
    private readonly config: ReferenceCaptureConfig,
    private readonly runner: ReferenceCaptureExp021MaturationShadowRunnerService,
    @Optional() private readonly leaderGuard?: SchedulerLeaderGuardService,
  ) {}

  onModuleInit(): void {
    if (this.config.isExp021MaturationShadowEnabled()) {
      this.logger.log('EXP-021 maturation shadow recovery scheduler active');
    }
  }

  @Interval(60_000)
  async recoverMissingObservationJobs(): Promise<void> {
    if (this.leaderGuard && !this.leaderGuard.shouldRun('reference_capture_exp021_maturation_shadow_recovery')) {
      return;
    }
    if (!this.config.isExp021MaturationShadowEnabled()) {
      return;
    }

    const { recovered, cleared } = await this.runner.reconcileExecutionState();
    if (recovered > 0 || cleared > 0) {
      this.logger.log(
        `Reconciled maturation shadow execution recovered=${recovered} cleared=${cleared}`,
      );
    }
  }
}
