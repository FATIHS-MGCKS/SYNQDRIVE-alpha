import { Injectable, Logger } from '@nestjs/common';
import {
  DeviceConnectionWebhookProcessingStatus,
  DimoDeviceConnectionEventType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DeviceConnectionWebhookService } from './device-connection-webhook.service';
import { DeviceConnectionWebhookInboxEnqueueService } from './device-connection-webhook-inbox-enqueue.service';
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
    private readonly enqueueService: DeviceConnectionWebhookInboxEnqueueService,
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

      const outcome = await this.enqueueService.enqueueOrMarkRetryableFailed(
        existing.id,
        'requeue',
      );
      if (outcome === 'failed') {
        throw new Error('enqueue_failed');
      }
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

    const outcome = await this.enqueueService.enqueueOrMarkRetryableFailed(
      inboxRow.id,
      'intake',
    );
    if (outcome === 'failed') {
      throw new Error('enqueue_failed');
    }

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
