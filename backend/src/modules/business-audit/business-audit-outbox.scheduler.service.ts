import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BUSINESS_AUDIT_OUTBOX } from './business-audit.constants';
import { BusinessAuditOutboxProcessorService } from './business-audit-outbox.processor';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';

@Injectable()
export class BusinessAuditOutboxSchedulerService {
  private readonly logger = new Logger(BusinessAuditOutboxSchedulerService.name);

  constructor(
    private readonly processor: BusinessAuditOutboxProcessorService,
    private readonly leaderGuard: SchedulerLeaderGuardService,
  ) {}

  @Cron('*/15 * * * * *')
  async pollPendingOutbox(): Promise<void> {
    if (!this.leaderGuard.shouldRun('business_audit_outbox')) return;
    try {
      await this.processor.processDue(BUSINESS_AUDIT_OUTBOX.pollBatchSize);
    } catch (err) {
      this.logger.error(
        'business audit outbox poll failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
