import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron } from '@nestjs/schedule';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { NotificationDeliveryEnqueueService } from './notification-delivery-enqueue.service';
import { NotificationDeliveryOutboxRepository } from './notification-delivery-outbox.repository';
import { NotificationDeliveryObservabilityService } from './notification-delivery-observability.service';
import { buildDeliveryJobId, buildDeliveryJobOptions } from './notification-delivery-queue.util';
import notificationDeliveryConfig from '@config/notification-delivery.config';
import { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';

@Injectable()
export class NotificationDeliverySchedulerService {
  constructor(
    @InjectQueue(QUEUE_NAMES.NOTIFICATION_DELIVERY)
    private readonly queue: Queue,
    @Inject(notificationDeliveryConfig.KEY)
    private readonly config: ConfigType<typeof notificationDeliveryConfig>,
    private readonly enqueueService: NotificationDeliveryEnqueueService,
    private readonly outboxRepo: NotificationDeliveryOutboxRepository,
    private readonly observability: NotificationDeliveryObservabilityService,
  ) {}

  async scheduleOutboxIds(outboxIds: string[]): Promise<void> {
    if (!this.enqueueService.isDeliveryEnabled() || outboxIds.length === 0) return;

    await Promise.all(
      outboxIds.map(async (outboxId) => {
        const jobId = buildDeliveryJobId(outboxId);
        const existing = await this.queue.getJob(jobId);
        if (existing) {
          const state = await existing.getState();
          if (state === 'active' || state === 'waiting' || state === 'delayed') return;
          if (state === 'completed' || state === 'failed') {
            await existing.remove();
          }
        }
        await this.queue.add(
          'deliver',
          { outboxId },
          buildDeliveryJobOptions(this.config, outboxId),
        );
      }),
    );
  }

  @Cron('*/30 * * * * *')
  async pollPendingOutbox(): Promise<void> {
    if (!this.enqueueService.isDeliveryEnabled()) return;

    const pending = await this.outboxRepo.findPendingBatch(this.config.pollBatchSize);
    const backlog = await this.outboxRepo.countBacklog();
    this.observability.setQueueBacklog(backlog);

    if (pending.length === 0) return;
    await this.scheduleOutboxIds(pending.map((row) => row.id));
  }
}
