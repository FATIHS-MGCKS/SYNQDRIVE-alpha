import { Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron } from '@nestjs/schedule';
import { ConfigType } from '@nestjs/config';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import paymentEmailConfig from '@config/payment-email.config';
import { PaymentEmailOutboxRepository } from './payment-email-outbox.repository';
import {
  PAYMENT_EMAIL_JOB_NAME,
  buildPaymentEmailJobId,
  buildPaymentEmailJobOptions,
} from './payment-email-queue.util';

@Injectable()
export class PaymentEmailSchedulerService {
  constructor(
    @InjectQueue(QUEUE_NAMES.PAYMENT_EMAIL)
    private readonly queue: Queue,
    @Inject(paymentEmailConfig.KEY)
    private readonly config: ConfigType<typeof paymentEmailConfig>,
    private readonly outboxRepo: PaymentEmailOutboxRepository,
  ) {}

  isEnabled(): boolean {
    return this.config.enabled;
  }

  async scheduleOutboxIds(outboxIds: string[]): Promise<void> {
    if (!this.isEnabled() || outboxIds.length === 0) {
      return;
    }

    await Promise.all(
      outboxIds.map(async (outboxId) => {
        const jobId = buildPaymentEmailJobId(outboxId);
        const existing = await this.queue.getJob(jobId);
        if (existing) {
          const state = await existing.getState();
          if (state === 'active' || state === 'waiting' || state === 'delayed') {
            return;
          }
          if (state === 'completed' || state === 'failed') {
            await existing.remove();
          }
        }
        await this.queue.add(
          PAYMENT_EMAIL_JOB_NAME,
          { outboxId },
          buildPaymentEmailJobOptions(this.config, outboxId),
        );
      }),
    );
  }

  @Cron('*/30 * * * * *')
  async pollPendingOutbox(): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    const pending = await this.outboxRepo.findPendingBatch(this.config.pollBatchSize);
    if (pending.length === 0) {
      return;
    }
    await this.scheduleOutboxIds(pending.map((row) => row.id));
  }
}
