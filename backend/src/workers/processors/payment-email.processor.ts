import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { PaymentEmailProcessorService } from '@modules/payments/email/payment-email-processor.service';

export interface PaymentEmailJobData {
  outboxId: string;
}

@Injectable()
@Processor(QUEUE_NAMES.PAYMENT_EMAIL, {
  concurrency: 2,
  lockDuration: 120_000,
})
export class PaymentEmailProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentEmailProcessor.name);

  constructor(private readonly processor: PaymentEmailProcessorService) {
    super();
  }

  async process(job: Job<PaymentEmailJobData>): Promise<void> {
    const result = await this.processor.processOutboxId(job.data.outboxId);
    this.logger.debug(`Processed payment email outbox ${job.data.outboxId}: ${result}`);
  }
}
