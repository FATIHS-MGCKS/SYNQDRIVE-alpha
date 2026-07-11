import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { NotificationDeliveryProcessorService } from '@modules/notifications/delivery/notification-delivery-processor.service';

export interface NotificationDeliveryJobData {
  outboxId: string;
}

@Injectable()
@Processor(QUEUE_NAMES.NOTIFICATION_DELIVERY, {
  concurrency: 4,
  lockDuration: 120_000,
})
export class NotificationDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationDeliveryProcessor.name);

  constructor(private readonly processor: NotificationDeliveryProcessorService) {
    super();
  }

  async process(job: Job<NotificationDeliveryJobData>): Promise<void> {
    const result = await this.processor.processOutboxId(job.data.outboxId);
    this.logger.debug(`Processed outbox ${job.data.outboxId}: ${result}`);
  }
}
