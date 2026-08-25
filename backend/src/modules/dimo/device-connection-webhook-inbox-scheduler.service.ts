import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import deviceConnectionWebhookInboxConfig from '@config/device-connection-webhook-inbox.config';
import { PrismaService } from '@shared/database/prisma.service';
import { DeviceConnectionWebhookInboxRepository } from './device-connection-webhook-inbox.repository';
import { DeviceConnectionWebhookQueueProducer } from './device-connection-webhook-queue.producer';
import { DeviceConnectionWebhookService } from './device-connection-webhook.service';

@Injectable()
export class DeviceConnectionWebhookInboxSchedulerService {
  private readonly logger = new Logger(DeviceConnectionWebhookInboxSchedulerService.name);

  constructor(
    @Inject(deviceConnectionWebhookInboxConfig.KEY)
    private readonly config: ConfigType<typeof deviceConnectionWebhookInboxConfig>,
    private readonly inboxRepo: DeviceConnectionWebhookInboxRepository,
    private readonly queue: DeviceConnectionWebhookQueueProducer,
    private readonly prisma: PrismaService,
    private readonly deviceConnection: DeviceConnectionWebhookService,
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
    if (retryable.length > 0) {
      await this.scheduleInboxIds(retryable.map((row) => row.id));
    }

    await this.reconcileUnprocessedCanonicalEvents();
  }

  /** Defense-in-depth: repair events persisted before episode lifecycle completed. */
  private async reconcileUnprocessedCanonicalEvents(): Promise<void> {
    const batch = await this.prisma.dimoDeviceConnectionEvent.findMany({
      where: { processedAt: null },
      orderBy: { receivedAt: 'asc' },
      take: this.config.pollBatchSize,
      select: { id: true },
    });
    if (batch.length === 0) return;

    for (const row of batch) {
      try {
        const result = await this.deviceConnection.reconcilePersistedEventLifecycle(row.id);
        this.logger.log(
          `Reconciled unprocessed canonical device connection event ${row.id} → ${result.outcome}`,
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Failed to reconcile unprocessed device connection event ${row.id}: ${message}`,
        );
      }
    }
  }
}
