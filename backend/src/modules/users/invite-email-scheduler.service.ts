import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { INVITE_EMAIL_OUTBOX } from './invite-email.constants';
import { InviteEmailDeliveryService } from './invite-email-delivery.service';
import { InviteEmailOutboxRepository } from './invite-email-outbox.repository';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';

@Injectable()
export class InviteEmailSchedulerService {
  private readonly logger = new Logger(InviteEmailSchedulerService.name);

  constructor(
    private readonly outboxRepo: InviteEmailOutboxRepository,
    private readonly delivery: InviteEmailDeliveryService,
    private readonly leaderGuard: SchedulerLeaderGuardService,
  ) {}

  @Cron('*/30 * * * * *')
  async pollPendingOutbox(): Promise<void> {
    if (!this.leaderGuard.shouldRun('invite_email')) return;
    const pending = await this.outboxRepo.findPendingBatch(INVITE_EMAIL_OUTBOX.pollBatchSize);
    if (pending.length === 0) {
      return;
    }
    for (const row of pending) {
      try {
        await this.delivery.processOutboxId(row.id);
      } catch (err) {
        this.logger.error(
          `invite outbox poll failed outboxId=${row.id}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
  }
}
