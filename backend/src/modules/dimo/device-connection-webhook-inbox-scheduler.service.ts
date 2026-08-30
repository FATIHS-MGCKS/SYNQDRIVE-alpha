import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import deviceConnectionWebhookInboxConfig from '@config/device-connection-webhook-inbox.config';
import { PrismaService } from '@shared/database/prisma.service';
import { ConnectivityLifecycleRuntimePolicyService } from './connectivity/connectivity-lifecycle-runtime-policy.service';
import { DeviceConnectionWebhookInboxEnqueueService } from './device-connection-webhook-inbox-enqueue.service';
import { DeviceConnectionWebhookInboxRepository } from './device-connection-webhook-inbox.repository';
import { DeviceConnectionWebhookService } from './device-connection-webhook.service';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';

@Injectable()
export class DeviceConnectionWebhookInboxSchedulerService {
  private readonly logger = new Logger(DeviceConnectionWebhookInboxSchedulerService.name);

  constructor(
    @Inject(deviceConnectionWebhookInboxConfig.KEY)
    private readonly config: ConfigType<typeof deviceConnectionWebhookInboxConfig>,
    private readonly lifecyclePolicy: ConnectivityLifecycleRuntimePolicyService,
    private readonly inboxRepo: DeviceConnectionWebhookInboxRepository,
    private readonly enqueueService: DeviceConnectionWebhookInboxEnqueueService,
    private readonly prisma: PrismaService,
    private readonly deviceConnection: DeviceConnectionWebhookService,
    private readonly leaderGuard: SchedulerLeaderGuardService,
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
    if (!this.leaderGuard.shouldRun('device_connection_webhook_inbox')) return;
    if (!this.lifecyclePolicy.automaticLifecycleReconciliationEnabled) {
      await this.reportHistoricalOrphansWithoutCutover();
      return;
    }

    const cutover = this.lifecyclePolicy.lifecycleReconcileAfter;
    if (!cutover) {
      return;
    }

    const now = new Date();
    const staleBefore = new Date(now.getTime() - this.config.processingStaleMs);

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

  private async reportHistoricalOrphansWithoutCutover(): Promise<void> {
    const [historicalEvents, historicalInbox] = await Promise.all([
      this.prisma.dimoDeviceConnectionEvent.count({
        where: { processedAt: null },
      }),
      this.prisma.deviceConnectionWebhookInbox.count({
        where: {
          processingStatus: { in: ['RECEIVED', 'VALIDATED', 'RETRYABLE_FAILED'] },
          processedAt: null,
        },
      }),
    ]);

    if (historicalEvents > 0 || historicalInbox > 0) {
      this.logger.warn({
        msg: 'connectivity.historical_orphan_backlog',
        historicalUnprocessedEvents: historicalEvents,
        historicalUnprocessedInbox: historicalInbox,
        automaticReconciliationEnabled: false,
      });
    }
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
      try {
        const result = await this.deviceConnection.reconcilePersistedEventLifecycle(row.id);
        if (
          result.outcome === 'historical_orphan' ||
          result.outcome === 'reconciliation_disabled'
        ) {
          this.logger.debug(
            `Skipped canonical event ${row.id} — ${result.outcome} (receivedAt=${row.receivedAt.toISOString()})`,
          );
          continue;
        }
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
