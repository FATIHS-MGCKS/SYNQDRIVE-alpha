import { Injectable, Logger } from '@nestjs/common';
import {
  DeviceConnectionWebhookProcessingStatus,
  DimoDeviceConnectionEventType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DeviceConnectionWebhookService } from './device-connection-webhook.service';
import { DeviceConnectionWebhookQueueProducer } from './device-connection-webhook-queue.producer';
import {
  computeProviderEventId,
  computeWebhookPayloadHash,
  isTerminalInboxStatus,
  type DeviceConnectionWebhookIntakeOutcome,
} from './device-connection-webhook-inbox.types';

export interface DeviceConnectionWebhookIntakeInput {
  tokenId: number;
  pluggedIn: boolean;
  observedAt: Date;
  rawPayload: unknown;
  provider?: string;
}

export interface DeviceConnectionWebhookIntakeResult {
  outcome: DeviceConnectionWebhookIntakeOutcome;
  inboxId: string;
  processingStatus: DeviceConnectionWebhookProcessingStatus;
  eventId?: string;
  eventType?: DimoDeviceConnectionEventType;
  policyIgnoreReason?: string;
  errorCode?: string;
}

@Injectable()
export class DeviceConnectionWebhookInboxService {
  private readonly logger = new Logger(DeviceConnectionWebhookInboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: DeviceConnectionWebhookQueueProducer,
  ) {}

  async intakeDeviceConnectionWebhook(
    input: DeviceConnectionWebhookIntakeInput,
  ): Promise<DeviceConnectionWebhookIntakeResult> {
    const provider = input.provider ?? 'DIMO';
    const eventType = DeviceConnectionWebhookService.eventTypeForPlugState(input.pluggedIn);
    const providerEventId = computeProviderEventId({
      provider,
      tokenId: input.tokenId,
      eventType,
      observedAt: input.observedAt,
    });
    const payloadHash = computeWebhookPayloadHash(input.rawPayload);
    const receivedAt = new Date();

    const existing = await this.prisma.deviceConnectionWebhookInbox.findUnique({
      where: {
        provider_providerEventId: { provider, providerEventId },
      },
    });

    if (existing) {
      if (isTerminalInboxStatus(existing.processingStatus)) {
        return {
          outcome: this.mapTerminalOutcome(existing.processingStatus, existing.domainEventId),
          inboxId: existing.id,
          processingStatus: existing.processingStatus,
          eventId: existing.domainEventId ?? undefined,
          eventType: existing.eventType,
          policyIgnoreReason: existing.policyIgnoreReason ?? undefined,
          errorCode: existing.lastErrorCode ?? undefined,
        };
      }

      await this.safeEnqueue(existing.id, 'requeue');
      return {
        outcome: 'queued',
        inboxId: existing.id,
        processingStatus: existing.processingStatus,
        eventType: existing.eventType,
      };
    }

    const inboxRow = await this.prisma.deviceConnectionWebhookInbox.create({
      data: {
        providerEventId,
        provider,
        eventType,
        observedAt: input.observedAt,
        receivedAt,
        processingStatus: DeviceConnectionWebhookProcessingStatus.RECEIVED,
        payloadHash,
        tokenId: input.tokenId,
        rawPayloadJson: input.rawPayload as object,
      },
    });

    await this.safeEnqueue(inboxRow.id, 'intake');

    this.logger.log(
      `Queued device connection webhook inbox ${inboxRow.id} for tokenId=${input.tokenId} eventType=${eventType}`,
    );

    return {
      outcome: 'queued',
      inboxId: inboxRow.id,
      processingStatus: DeviceConnectionWebhookProcessingStatus.RECEIVED,
      eventType,
    };
  }

  private async safeEnqueue(inboxId: string, source: 'intake' | 'requeue'): Promise<void> {
    try {
      await this.queue.enqueue(inboxId);
      this.logger.debug(`Enqueued connectivity webhook inbox ${inboxId} source=${source}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to enqueue connectivity webhook inbox ${inboxId} source=${source}: ${message}`,
      );
      const nextRetryAt = new Date(Date.now() + 30_000);
      await this.prisma.deviceConnectionWebhookInbox.update({
        where: { id: inboxId },
        data: {
          processingStatus: DeviceConnectionWebhookProcessingStatus.RETRYABLE_FAILED,
          lastErrorCode: 'enqueue_failed',
          lastErrorAt: new Date(),
          nextRetryAt,
        },
      });
      throw err;
    }
  }

  private mapTerminalOutcome(
    status: DeviceConnectionWebhookProcessingStatus,
    domainEventId: string | null,
  ): DeviceConnectionWebhookIntakeOutcome {
    switch (status) {
      case DeviceConnectionWebhookProcessingStatus.PROCESSED:
        return domainEventId ? 'already_processed' : 'duplicate';
      case DeviceConnectionWebhookProcessingStatus.IGNORED_BY_POLICY:
        return 'ignored_by_policy';
      case DeviceConnectionWebhookProcessingStatus.PERMANENTLY_FAILED:
        return 'permanently_failed';
      case DeviceConnectionWebhookProcessingStatus.DEAD_LETTER:
        return 'permanently_failed';
      default:
        return 'already_processed';
    }
  }
}
