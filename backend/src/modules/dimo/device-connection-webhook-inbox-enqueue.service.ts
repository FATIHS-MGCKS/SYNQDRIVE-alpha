import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import deviceConnectionWebhookInboxConfig from '@config/device-connection-webhook-inbox.config';
import { DeviceConnectionWebhookInboxRepository } from './device-connection-webhook-inbox.repository';
import { DeviceConnectionWebhookQueueProducer } from './device-connection-webhook-queue.producer';

export type DeviceConnectionWebhookEnqueueSource = 'intake' | 'requeue' | 'scheduler';

@Injectable()
export class DeviceConnectionWebhookInboxEnqueueService {
  private readonly logger = new Logger(DeviceConnectionWebhookInboxEnqueueService.name);

  constructor(
    @Inject(deviceConnectionWebhookInboxConfig.KEY)
    private readonly config: ConfigType<typeof deviceConnectionWebhookInboxConfig>,
    private readonly inboxRepo: DeviceConnectionWebhookInboxRepository,
    private readonly queue: DeviceConnectionWebhookQueueProducer,
  ) {}

  /**
   * Enqueue inbox processing. On failure, persist RETRYABLE_FAILED so rows cannot remain
   * silently stuck in RECEIVED/VALIDATED.
   */
  async enqueueOrMarkRetryableFailed(
    inboxId: string,
    source: DeviceConnectionWebhookEnqueueSource,
    replay = false,
  ): Promise<'queued' | 'failed'> {
    try {
      await this.queue.enqueue(inboxId, replay);
      this.logger.debug(`Enqueued connectivity webhook inbox ${inboxId} source=${source}`);
      return 'queued';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const nextRetryAt = new Date(Date.now() + this.config.baseBackoffMs);
      await this.inboxRepo.markRetryableFailed(inboxId, {
        errorCode: 'enqueue_failed',
        errorMessage: message,
        nextRetryAt,
      });
      this.logger.error(
        `Failed to enqueue connectivity webhook inbox ${inboxId} source=${source}: ${message}`,
      );
      return 'failed';
    }
  }
}
