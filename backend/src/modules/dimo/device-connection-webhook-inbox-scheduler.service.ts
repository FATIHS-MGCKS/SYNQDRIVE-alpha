import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import deviceConnectionWebhookInboxConfig from '@config/device-connection-webhook-inbox.config';
import { DeviceConnectionWebhookInboxRepository } from './device-connection-webhook-inbox.repository';
import { DeviceConnectionWebhookQueueProducer } from './device-connection-webhook-queue.producer';

@Injectable()
export class DeviceConnectionWebhookInboxSchedulerService {
  constructor(
    @Inject(deviceConnectionWebhookInboxConfig.KEY)
    private readonly config: ConfigType<typeof deviceConnectionWebhookInboxConfig>,
    private readonly inboxRepo: DeviceConnectionWebhookInboxRepository,
    private readonly queue: DeviceConnectionWebhookQueueProducer,
  ) {}

  async scheduleInboxIds(inboxIds: string[], replay = false): Promise<void> {
    if (inboxIds.length === 0) return;
    await Promise.all(inboxIds.map((inboxId) => this.queue.enqueue(inboxId, replay)));
  }

  @Cron('*/30 * * * * *')
  async pollRetryableInbox(): Promise<void> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - this.config.processingStaleMs);

    const stale = await this.inboxRepo.findStaleInFlightBatch(
      staleBefore,
      this.config.pollBatchSize,
    );
    if (stale.length > 0) {
      await this.scheduleInboxIds(stale.map((row) => row.id));
    }

    const retryable = await this.inboxRepo.findRetryableBatch(this.config.pollBatchSize, now);
    if (retryable.length === 0) return;
    await this.scheduleInboxIds(retryable.map((row) => row.id));
  }
}
