import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { IAM_AUDIT_OUTBOX } from './iam-audit.constants';
import { IamAuditOutboxProcessorService } from './iam-audit-outbox.processor';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';

@Injectable()
export class IamAuditOutboxSchedulerService {
  private readonly logger = new Logger(IamAuditOutboxSchedulerService.name);

  constructor(
    private readonly processor: IamAuditOutboxProcessorService,
    private readonly leaderGuard: SchedulerLeaderGuardService,
  ) {}

  @Cron('*/15 * * * * *')
  async pollPendingOutbox(): Promise<void> {
    if (!this.leaderGuard.shouldRun('iam_audit_outbox')) return;
    try {
      await this.processor.processDue(IAM_AUDIT_OUTBOX.pollBatchSize);
    } catch (err) {
      this.logger.error(
        'iam audit outbox poll failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
