import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { MASTER_ADMIN_AUDIT_OUTBOX } from './master-admin-audit-outbox.constants';
import { MasterAdminAuditOutboxProcessorService } from './master-admin-audit-outbox.processor';

@Injectable()
export class MasterAdminAuditOutboxSchedulerService {
  private readonly logger = new Logger(MasterAdminAuditOutboxSchedulerService.name);
  private pollInFlight = false;

  constructor(
    private readonly processor: MasterAdminAuditOutboxProcessorService,
    private readonly leaderGuard: SchedulerLeaderGuardService,
  ) {}

  @Cron('*/15 * * * * *')
  async pollPendingOutbox(): Promise<void> {
    if (!this.leaderGuard.shouldRun('master_admin_audit_outbox')) {
      return;
    }
    if (this.pollInFlight) {
      return;
    }
    this.pollInFlight = true;
    try {
      await this.processor.processDue(MASTER_ADMIN_AUDIT_OUTBOX.pollBatchSize);
    } catch (err) {
      this.logger.error(
        'master_admin_audit_outbox poll failed',
        err instanceof Error ? err.stack : String(err),
      );
    } finally {
      this.pollInFlight = false;
    }
  }
}