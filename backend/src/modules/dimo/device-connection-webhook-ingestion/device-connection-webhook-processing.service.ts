import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DeviceConnectionWebhookInboxStatus,
  DimoDeviceConnectionEventType,
} from '@prisma/client';
import { DeviceConnectionWebhookService } from '../device-connection-webhook.service';
import {
  DEVICE_CONNECTION_WEBHOOK_ERROR_CODES,
  DEVICE_CONNECTION_WEBHOOK_MAX_PROCESSING_RETRIES,
} from './device-connection-webhook-ingestion.constants';
import { DeviceConnectionWebhookInboxRepository } from './device-connection-webhook-inbox.repository';
import { DeviceConnectionWebhookQueueProducer } from './device-connection-webhook-ingest.service';

export class DeviceConnectionWebhookProcessingError extends Error {
  constructor(
    message: string,
    readonly errorCode: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'DeviceConnectionWebhookProcessingError';
  }
}

@Injectable()
export class DeviceConnectionWebhookProcessingService {
  private readonly logger = new Logger(DeviceConnectionWebhookProcessingService.name);

  constructor(
    private readonly inbox: DeviceConnectionWebhookInboxRepository,
    private readonly webhook: DeviceConnectionWebhookService,
  ) {}

  async processInboxId(inboxId: string, replay = false): Promise<void> {
    const row = await this.inbox.findById(inboxId);
    if (!row) {
      throw new NotFoundException(`Device connection webhook inbox ${inboxId} not found`);
    }

    if (!replay) {
      if (row.processingStatus === DeviceConnectionWebhookInboxStatus.PROCESSED) return;
      if (row.processingStatus === DeviceConnectionWebhookInboxStatus.IGNORED_BY_POLICY) return;
      if (row.processingStatus === DeviceConnectionWebhookInboxStatus.PERMANENTLY_FAILED) return;
      if (row.processingStatus === DeviceConnectionWebhookInboxStatus.DEAD_LETTER) return;
    }

    if (
      !row.vehicleId ||
      !row.organizationId ||
      row.tokenId == null ||
      !row.eventType ||
      !row.observedAt
    ) {
      await this.inbox.markPermanentlyFailed(inboxId, {
        errorCode: DEVICE_CONNECTION_WEBHOOK_ERROR_CODES.MAPPING_FAILED,
        errorMessage: 'inbox_missing_vehicle_or_parse_fields',
      });
      return;
    }

    await this.inbox.incrementProcessingAttempt(inboxId);

    const redacted =
      row.redactedPayloadJson &&
      typeof row.redactedPayloadJson === 'object' &&
      !Array.isArray(row.redactedPayloadJson)
        ? row.redactedPayloadJson
        : {};

    try {
      const pluggedIn =
        row.eventType === DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN;

      const result = await this.webhook.processInboxEntry({
        inboxId,
        vehicle: { id: row.vehicleId, organizationId: row.organizationId },
        tokenId: row.tokenId,
        pluggedIn,
        observedAt: row.observedAt,
        eventType: row.eventType,
        rawPayload: redacted,
        receivedAt: row.receivedAt,
      });

      if (result.outcome === 'ignored_by_policy') {
        await this.inbox.markIgnoredByPolicy(inboxId, result.policyReason ?? 'policy_gate');
        this.logger.debug(
          `Device connection inbox ${inboxId} ignored by policy: ${result.policyReason}`,
        );
        return;
      }

      if (result.outcome === 'duplicate') {
        await this.inbox.markProcessed(inboxId, result.eventId);
        return;
      }

      await this.inbox.markProcessed(inboxId, result.eventId);
      this.logger.log(
        JSON.stringify({
          event: 'device_connection_webhook_processed',
          inboxId,
          connectionEventId: result.eventId,
          eventType: result.eventType,
        }),
      );
    } catch (err: unknown) {
      const classified = this.classifyError(err);
      const nextAttempt = row.processingAttempts + 1;

      if (!classified.retryable || nextAttempt >= DEVICE_CONNECTION_WEBHOOK_MAX_PROCESSING_RETRIES) {
        const status =
          classified.retryable && nextAttempt >= DEVICE_CONNECTION_WEBHOOK_MAX_PROCESSING_RETRIES
            ? DeviceConnectionWebhookInboxStatus.DEAD_LETTER
            : DeviceConnectionWebhookInboxStatus.PERMANENTLY_FAILED;

        if (status === DeviceConnectionWebhookInboxStatus.DEAD_LETTER) {
          await this.inbox.markDeadLetter(inboxId, {
            errorCode: classified.errorCode,
            errorMessage: classified.message,
          });
        } else {
          await this.inbox.markPermanentlyFailed(inboxId, {
            errorCode: classified.errorCode,
            errorMessage: classified.message,
          });
        }

        this.logger.error(
          JSON.stringify({
            event: 'device_connection_webhook_dlq',
            inboxId,
            errorCode: classified.errorCode,
            detail: classified.message,
            status,
          }),
        );
        return;
      }

      const nextRetryAt = new Date(Date.now() + Math.min(60_000, 5_000 * 2 ** nextAttempt));
      await this.inbox.markRetryableFailed(inboxId, {
        errorCode: classified.errorCode,
        errorMessage: classified.message,
        nextRetryAt,
      });

      this.logger.warn(
        `Device connection inbox ${inboxId} retryable failure (${classified.errorCode}): ${classified.message}`,
      );
      throw new DeviceConnectionWebhookProcessingError(
        classified.message,
        classified.errorCode,
        true,
      );
    }
  }

  private classifyError(err: unknown): {
    errorCode: string;
    message: string;
    retryable: boolean;
  } {
    const message = err instanceof Error ? err.message : String(err);

    if (message.startsWith('EPISODE_SYNC_FAILED:')) {
      return {
        errorCode: DEVICE_CONNECTION_WEBHOOK_ERROR_CODES.EPISODE_SYNC_FAILED,
        message,
        retryable: true,
      };
    }

    if (message.includes('Cross-tenant') || message.includes('TENANT_MISMATCH')) {
      return {
        errorCode: DEVICE_CONNECTION_WEBHOOK_ERROR_CODES.TENANT_MISMATCH,
        message,
        retryable: false,
      };
    }

    if (message.includes('DEVICE_CONNECTION_PAYLOAD_TOO_LARGE')) {
      return {
        errorCode: DEVICE_CONNECTION_WEBHOOK_ERROR_CODES.POISON_PAYLOAD,
        message,
        retryable: false,
      };
    }

    if (
      message.includes('Prisma') ||
      message.includes('database') ||
      message.includes('timeout') ||
      message.includes('ECONNRESET')
    ) {
      return {
        errorCode: DEVICE_CONNECTION_WEBHOOK_ERROR_CODES.DB_PERSIST_FAILED,
        message,
        retryable: true,
      };
    }

    return {
      errorCode: DEVICE_CONNECTION_WEBHOOK_ERROR_CODES.DB_PERSIST_FAILED,
      message,
      retryable: true,
    };
  }
}

@Injectable()
export class DeviceConnectionWebhookReplayService {
  constructor(
    private readonly inbox: DeviceConnectionWebhookInboxRepository,
    private readonly queue: DeviceConnectionWebhookQueueProducer,
  ) {}

  async replayForOrganization(
    organizationId: string,
    inboxId: string,
  ): Promise<{ queued: boolean }> {
    const row = await this.inbox.findByIdForOrganization(organizationId, inboxId);
    if (!row) {
      throw new NotFoundException('Device connection webhook inbox row not found for organization');
    }
    await this.queue.enqueue(inboxId, true);
    return { queued: true };
  }
}
