import { Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import deviceConnectionWebhookInboxConfig from '@config/device-connection-webhook-inbox.config';
import { ConnectivityObservabilityService } from './connectivity/connectivity-observability.service';
import { DeviceConnectionWebhookService } from './device-connection-webhook.service';
import {
  isPermanentWebhookError,
  resolveWebhookErrorCode,
  resolveWebhookErrorMessage,
} from './device-connection-webhook-inbox-error.util';
import { DeviceConnectionWebhookInboxRepository } from './device-connection-webhook-inbox.repository';
import { isTerminalInboxStatus } from './device-connection-webhook-inbox.types';

export type DeviceConnectionWebhookProcessOutcome =
  | 'processed'
  | 'ignored_by_policy'
  | 'duplicate'
  | 'permanently_failed'
  | 'retry_scheduled'
  | 'dead_letter'
  | 'skipped';

@Injectable()
export class DeviceConnectionWebhookProcessingService {
  private readonly logger = new Logger(DeviceConnectionWebhookProcessingService.name);

  constructor(
    @Inject(deviceConnectionWebhookInboxConfig.KEY)
    private readonly config: ConfigType<typeof deviceConnectionWebhookInboxConfig>,
    private readonly inboxRepo: DeviceConnectionWebhookInboxRepository,
    private readonly deviceConnection: DeviceConnectionWebhookService,
    @Optional() private readonly observability?: ConnectivityObservabilityService,
  ) {}

  async processInboxId(
    inboxId: string,
    replay = false,
  ): Promise<DeviceConnectionWebhookProcessOutcome> {
    const existing = await this.inboxRepo.findById(inboxId);
    if (!existing) {
      throw new NotFoundException(`Device connection webhook inbox row ${inboxId} not found`);
    }

    if (!replay && isTerminalInboxStatus(existing.processingStatus)) {
      return 'skipped';
    }

    const claimed = await this.inboxRepo.claimForProcessing(inboxId);
    if (!claimed) {
      return 'skipped';
    }

    const pluggedIn = DeviceConnectionWebhookService.pluggedInFromEventType(claimed.eventType);
    return this.executeClaimedRow(claimed, pluggedIn, replay);
  }

  private async executeClaimedRow(
    row: NonNullable<Awaited<ReturnType<DeviceConnectionWebhookInboxRepository['claimForProcessing']>>>,
    pluggedIn: boolean,
    replay: boolean,
  ): Promise<DeviceConnectionWebhookProcessOutcome> {
    const inboxId = row.id;

    try {
      const vehicle = await this.inboxRepo.findVehicleByTokenId(row.tokenId);
      if (!vehicle) {
        await this.inboxRepo.markPermanentlyFailed(inboxId, { errorCode: 'unknown_vehicle' });
        this.observability?.logWarn('webhook_processing', {
          provider: row.provider,
          eventType: row.eventType,
          outcome: 'failed',
          reason: 'unknown_vehicle',
        });
        return 'permanently_failed';
      }

      await this.inboxRepo.markValidated(inboxId, {
        organizationId: vehicle.organizationId,
        vehicleId: vehicle.id,
      });

      const domainResult = await this.deviceConnection.processValidatedWebhookEvent({
        vehicle: { id: vehicle.id, organizationId: vehicle.organizationId },
        tokenId: row.tokenId,
        pluggedIn,
        observedAt: row.observedAt,
        rawPayload: row.rawPayloadJson,
        inboxId,
      });

      if (domainResult.outcome === 'ignored_by_policy') {
        await this.inboxRepo.markIgnoredByPolicy(inboxId, domainResult.policyReason ?? 'policy');
        this.observability?.log('webhook_processing', {
          provider: row.provider,
          eventType: row.eventType,
          outcome: 'ignored',
          reason: domainResult.policyReason,
        });
        return 'ignored_by_policy';
      }

      if (domainResult.outcome === 'duplicate') {
        await this.inboxRepo.markProcessed(inboxId, { domainEventId: domainResult.eventId });
        this.observability?.log('webhook_processing', {
          provider: row.provider,
          eventType: row.eventType,
          outcome: 'duplicate',
        });
        return 'duplicate';
      }

      await this.inboxRepo.markProcessed(inboxId, { domainEventId: domainResult.eventId });
      this.observability?.log('webhook_processing', {
        provider: row.provider,
        eventType: row.eventType,
        outcome: 'processed',
      });
      return 'processed';
    } catch (err: unknown) {
      return this.handleProcessingFailure(row, err, replay);
    }
  }

  private async handleProcessingFailure(
    row: NonNullable<Awaited<ReturnType<DeviceConnectionWebhookInboxRepository['claimForProcessing']>>>,
    err: unknown,
    replay: boolean,
  ): Promise<DeviceConnectionWebhookProcessOutcome> {
    const inboxId = row.id;
    const errorCode = resolveWebhookErrorCode(err);
    const errorMessage = resolveWebhookErrorMessage(err);
    const attempts = row.processingAttempts;

    if (isPermanentWebhookError(err)) {
      await this.inboxRepo.markPermanentlyFailed(inboxId, { errorCode });
      this.observability?.logWarn('webhook_processing', {
        provider: row.provider,
        eventType: row.eventType,
        outcome: 'failed',
        reason: errorCode,
      });
      return 'permanently_failed';
    }

    if (attempts >= this.config.maxAttempts) {
      await this.inboxRepo.markDeadLetter(inboxId, { errorCode, errorMessage });
      this.observability?.logWarn('webhook_processing', {
        provider: row.provider,
        eventType: row.eventType,
        outcome: 'dead_letter',
        reason: errorCode,
      });
      this.logger.error(
        `Device connection webhook inbox ${inboxId} moved to dead letter after ${attempts} attempts: ${errorMessage}`,
      );
      return 'dead_letter';
    }

    const nextRetryAt = new Date(
      Date.now() + this.config.baseBackoffMs * Math.pow(2, Math.max(0, attempts - 1)),
    );
    await this.inboxRepo.markRetryableFailed(inboxId, {
      errorCode,
      errorMessage,
      nextRetryAt,
    });
    this.observability?.logWarn('webhook_processing', {
      provider: row.provider,
      eventType: row.eventType,
      outcome: 'failed',
      reason: errorCode,
    });
    this.logger.warn(
      `Device connection webhook inbox ${inboxId} scheduled for retry at ${nextRetryAt.toISOString()} (attempt ${attempts})`,
    );

    if (!replay) {
      throw err instanceof Error ? err : new Error(errorMessage);
    }
    return 'retry_scheduled';
  }
}
