import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { randomUUID } from 'crypto';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { BookingDomainEventOutboxProcessorService } from '@modules/bookings/outbox/booking-domain-event-outbox-processor.service';

export interface BookingDomainEventOutboxJobData {
  outboxId: string;
}

@Injectable()
@Processor(QUEUE_NAMES.BOOKING_DOMAIN_EVENTS, {
  concurrency: 4,
  lockDuration: 120_000,
})
export class BookingDomainEventOutboxProcessor extends WorkerHost {
  private readonly logger = new Logger(BookingDomainEventOutboxProcessor.name);

  constructor(private readonly processor: BookingDomainEventOutboxProcessorService) {
    super();
  }

  async process(job: Job<BookingDomainEventOutboxJobData>): Promise<void> {
    const workerId = `bullmq:${job.id ?? randomUUID()}`;
    const result = await this.processor.processOutboxId(job.data.outboxId, workerId);
    this.logger.debug(
      `Processed booking domain event outbox ${job.data.outboxId}: ${result}`,
    );
  }
}
