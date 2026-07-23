import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron } from '@nestjs/schedule';
import { ConfigType } from '@nestjs/config';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import bookingDomainEventOutboxConfig from '@config/booking-domain-event-outbox.config';
import { BookingDomainEventOutboxRepository } from './booking-domain-event-outbox.repository';
import { BookingDomainEventOutboxObservabilityService } from './booking-domain-event-outbox-observability.service';
import {
  BOOKING_DOMAIN_EVENT_OUTBOX_JOB_NAME,
  buildBookingDomainEventOutboxJobId,
  buildBookingDomainEventOutboxJobOptions,
} from './booking-domain-event-outbox-queue.util';

@Injectable()
export class BookingDomainEventOutboxSchedulerService {
  constructor(
    @InjectQueue(QUEUE_NAMES.BOOKING_DOMAIN_EVENTS)
    private readonly queue: Queue,
    @Inject(bookingDomainEventOutboxConfig.KEY)
    private readonly config: ConfigType<typeof bookingDomainEventOutboxConfig>,
    private readonly outboxRepo: BookingDomainEventOutboxRepository,
    private readonly observability: BookingDomainEventOutboxObservabilityService,
  ) {}

  isEnabled(): boolean {
    return this.config.enabled;
  }

  async scheduleOutboxIds(outboxIds: string[]): Promise<void> {
    if (!this.isEnabled() || outboxIds.length === 0) return;

    await Promise.all(
      outboxIds.map(async (outboxId) => {
        const jobId = buildBookingDomainEventOutboxJobId(outboxId);
        const existing = await this.queue.getJob(jobId);
        if (existing) {
          const state = await existing.getState();
          if (state === 'active' || state === 'waiting' || state === 'delayed') return;
          if (state === 'completed' || state === 'failed') {
            await existing.remove();
          }
        }
        await this.queue.add(
          BOOKING_DOMAIN_EVENT_OUTBOX_JOB_NAME,
          { outboxId },
          buildBookingDomainEventOutboxJobOptions(this.config, outboxId),
        );
      }),
    );
  }

  @Cron('*/30 * * * * *')
  async pollPendingOutbox(): Promise<void> {
    if (!this.isEnabled()) return;

    const staleBefore = new Date(Date.now() - this.config.processingStaleMs);
    const recovered = await this.outboxRepo.recoverStaleProcessing(staleBefore);
    if (recovered.length > 0) {
      await this.scheduleOutboxIds(recovered);
    }

    const pending = await this.outboxRepo.findPendingBatch(this.config.pollBatchSize);
    const backlog = await this.outboxRepo.countBacklog();
    this.observability.setQueueBacklog(backlog);
    if (pending.length === 0) return;
    await this.scheduleOutboxIds(pending.map((row) => row.id));
  }
}
