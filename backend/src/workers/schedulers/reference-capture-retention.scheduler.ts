import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ReferenceCaptureConfig } from '@modules/vehicle-intelligence/reference-capture/reference-capture.config';
import { ReferenceCaptureRetentionService } from '@modules/vehicle-intelligence/reference-capture/reference-capture-retention.service';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';

/**
 * Optional nightly reference-capture observation retention purge.
 * Disabled unless REFERENCE_CAPTURE_RETENTION_SCHEDULER_ENABLED=true.
 */
@Injectable()
export class ReferenceCaptureRetentionScheduler {
  private readonly logger = new Logger(ReferenceCaptureRetentionScheduler.name);

  constructor(
    private readonly config: ReferenceCaptureConfig,
    private readonly retention: ReferenceCaptureRetentionService,
    private readonly leaderGuard: SchedulerLeaderGuardService,
  ) {}

  @Cron('30 4 * * *')
  async scheduledRun(): Promise<void> {
    if (!this.config.isRetentionSchedulerEnabled()) return;
    if (!this.config.isEnabled()) return;
    if (!this.leaderGuard.shouldRun('reference_capture_retention')) return;

    const result = await this.retention.purgeExpiredObservations();
    this.logger.log(
      `Reference capture retention cron — deleted=${result.deletedCount} cutoff=${result.cutoff.toISOString()}`,
    );
  }
}
