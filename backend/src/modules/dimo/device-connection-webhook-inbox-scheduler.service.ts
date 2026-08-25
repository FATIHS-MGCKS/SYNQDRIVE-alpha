import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import deviceConnectionWebhookInboxConfig from '@config/device-connection-webhook-inbox.config';
import { PrismaService } from '@shared/database/prisma.service';
import { isHistoricalLifecycleOrphan } from './connectivity/connectivity-lifecycle-runtime.policy';
import { DeviceConnectionWebhookInboxEnqueueService } from './device-connection-webhook-inbox-enqueue.service';
import { DeviceConnectionWebhookInboxRepository } from './device-connection-webhook-inbox.repository';
import { DeviceConnectionWebhookService } from './device-connection-webhook.service';

@Injectable()
export class DeviceConnectionWebhookInboxSchedulerService {
  private readonly logger = new Logger(DeviceConnectionWebhookInboxSchedulerService.name);

  constructor(
    @Inject(deviceConnectionWebhookInboxConfig.KEY)
    private readonly config: ConfigType<typeof deviceConnectionWebhookInboxConfig>,
    private readonly inboxRepo: DeviceConnectionWebhookInboxRepository,
    private readonly enqueueService: DeviceConnectionWebhookInboxEnqueueService,
    private readonly prisma: PrismaService,
    private readonly deviceConnection: DeviceConnectionWebhookService,
  ) {}

  async scheduleInboxIds(inboxIds: string[], replay = false): Promise<void> {
    if (inboxIds.length === 0) return;

    for (const inboxId of inboxIds) {
      const outcome = await this.enqueueService.enqueueOrMarkRetryableFailed(
        inboxId,
        'scheduler',
        replay,
      );
      if (outcome === 'failed') {
        this.logger.warn(
          `Scheduler could not enqueue connectivity webhook inbox ${inboxId} — marked RETRYABLE_FAILED`,
        );
      }
    }
  }

  @Cron('*/30 * * * * *')
  async pollRetryableInbox(): Promise<void> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - this.config.processingStaleMs);
    const cutover = this.config.lifecycleReconcileAfter;

    const stale = await this.inboxRepo.findStaleInFlightBatch(
      staleBefore,
      this.config.pollBatchSize,
      cutover,
    );
    if (stale.length > 0) {
      await this.scheduleInboxIds(stale.map((row) => row.id));
    }

    const retryable = await this.inboxRepo.findRetryableBatch(
      this.config.pollBatchSize,
      now,
      cutover,
    );
    if (retryable.length > 0) {
      await this.scheduleInboxIds(retryable.map((row) => row.id));
    }

    await this.reportHistoricalOrphans(cutover);
    await this.reconcileUnprocessedCanonicalEvents(cutover);
  }

  private async reportHistoricalOrphans(cutover: Date): Promise<void> {
    const [historicalEvents, historicalInbox] = await Promise.all([
      this.prisma.dimoDeviceConnectionEvent.count({
        where: { processedAt: null, receivedAt: { lt: cutover } },
      }),
      this.prisma.deviceConnectionWebhookInbox.count({
        where: {
          processingStatus: { in: ['RECEIVED', 'VALIDATED', 'RETRYABLE_FAILED'] },
          receivedAt: { lt: cutover },
          processedAt: null,
        },
      }),
    ]);

    if (historicalEvents > 0 || historicalInbox > 0) {
      this.logger.warn({
        msg: 'connectivity.historical_orphan_backlog',
        historicalUnprocessedEvents: historicalEvents,
        historicalUnprocessedInbox: historicalInbox,
        cutover: cutover.toISOString(),
      });
    }
  }

  /** Defense-in-depth: repair current-era events where lifecycle did not complete. */
  private async reconcileUnprocessedCanonicalEvents(cutover: Date): Promise<void> {
    const batch = await this.prisma.dimoDeviceConnectionEvent.findMany({
      where: {
        processedAt: null,
        receivedAt: { gte: cutover },
      },
      orderBy: { receivedAt: 'asc' },
      take: this.config.pollBatchSize,
      select: { id: true, receivedAt: true },
    });
    if (batch.length === 0) return;

    for (const row of batch) {
      if (isHistoricalLifecycleOrphan(row.receivedAt, cutover)) {
        this.logger.debug(
          `Skipping historical canonical orphan event ${row.id} (receivedAt=${row.receivedAt.toISOString()})`,
        );
        continue;
      }

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
