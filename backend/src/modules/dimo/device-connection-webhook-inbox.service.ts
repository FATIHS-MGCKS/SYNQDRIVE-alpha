import { Injectable, Logger } from '@nestjs/common';
import {
  DeviceConnectionWebhookBindingMappingStatus,
  DeviceConnectionWebhookProcessingStatus,
  DeviceConnectionWebhookVehicleMappingStatus,
  DimoDeviceConnectionEventType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DeviceConnectionWebhookService,
  type DeviceConnectionVehicle,
} from './device-connection-webhook.service';
import {
  computeProviderEventId,
  computeWebhookPayloadHash,
  isTerminalInboxStatus,
  type DeviceConnectionWebhookIntakeOutcome,
} from './device-connection-webhook-inbox.types';

const RETRY_BACKOFF_MS = 60_000;

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
    private readonly deviceConnection: DeviceConnectionWebhookService,
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

      if (existing.processingStatus === DeviceConnectionWebhookProcessingStatus.RETRYABLE_FAILED) {
        return this.retryProcessing(existing.id);
      }

      return {
        outcome: 'already_processed',
        inboxId: existing.id,
        processingStatus: existing.processingStatus,
        eventId: existing.domainEventId ?? undefined,
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

    return this.processInboxRow(inboxRow.id, input);
  }

  private async retryProcessing(inboxId: string): Promise<DeviceConnectionWebhookIntakeResult> {
    const row = await this.prisma.deviceConnectionWebhookInbox.findUniqueOrThrow({
      where: { id: inboxId },
    });
    const pluggedIn = DeviceConnectionWebhookService.pluggedInFromEventType(row.eventType);
    return this.processInboxRow(inboxId, {
      tokenId: row.tokenId,
      pluggedIn,
      observedAt: row.observedAt,
      rawPayload: row.rawPayloadJson,
      provider: row.provider,
    });
  }

  private async processInboxRow(
    inboxId: string,
    input: DeviceConnectionWebhookIntakeInput,
  ): Promise<DeviceConnectionWebhookIntakeResult> {
    const row = await this.prisma.deviceConnectionWebhookInbox.findUniqueOrThrow({
      where: { id: inboxId },
    });
    const eventType = DeviceConnectionWebhookService.eventTypeForPlugState(input.pluggedIn);
    const attempts = row.processingAttempts + 1;

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { dimoVehicle: { tokenId: input.tokenId } },
      select: { id: true, organizationId: true },
    });

    if (!vehicle) {
      const processedAt = new Date();
      await this.prisma.deviceConnectionWebhookInbox.update({
        where: { id: inboxId },
        data: {
          processingAttempts: attempts,
          processingStatus: DeviceConnectionWebhookProcessingStatus.PERMANENTLY_FAILED,
          vehicleMappingStatus: DeviceConnectionWebhookVehicleMappingStatus.UNKNOWN_VEHICLE,
          lastErrorCode: 'unknown_vehicle',
          lastErrorAt: processedAt,
          processedAt,
        },
      });
      this.logger.warn(
        `Device connection webhook inbox ${inboxId}: unknown vehicle for tokenId=${input.tokenId}`,
      );
      return {
        outcome: 'permanently_failed',
        inboxId,
        processingStatus: DeviceConnectionWebhookProcessingStatus.PERMANENTLY_FAILED,
        eventType,
        errorCode: 'unknown_vehicle',
      };
    }

    await this.prisma.deviceConnectionWebhookInbox.update({
      where: { id: inboxId },
      data: {
        organizationId: vehicle.organizationId,
        vehicleId: vehicle.id,
        vehicleMappingStatus: DeviceConnectionWebhookVehicleMappingStatus.RESOLVED,
        processingStatus: DeviceConnectionWebhookProcessingStatus.VALIDATED,
        processingAttempts: attempts,
      },
    });

    try {
      const domainResult = await this.deviceConnection.processValidatedWebhookEvent({
        vehicle: { id: vehicle.id, organizationId: vehicle.organizationId },
        tokenId: input.tokenId,
        pluggedIn: input.pluggedIn,
        observedAt: input.observedAt,
        rawPayload: input.rawPayload,
        inboxId,
      });

      if (domainResult.outcome === 'ignored_by_policy') {
        const processedAt = new Date();
        await this.prisma.deviceConnectionWebhookInbox.update({
          where: { id: inboxId },
          data: {
            processingStatus: DeviceConnectionWebhookProcessingStatus.IGNORED_BY_POLICY,
            policyIgnoreReason: domainResult.policyReason,
            bindingMappingStatus: DeviceConnectionWebhookBindingMappingStatus.RESOLVED,
            processedAt,
          },
        });
        return {
          outcome: 'ignored_by_policy',
          inboxId,
          processingStatus: DeviceConnectionWebhookProcessingStatus.IGNORED_BY_POLICY,
          eventType,
          policyIgnoreReason: domainResult.policyReason,
        };
      }

      if (domainResult.outcome === 'duplicate') {
        const processedAt = new Date();
        await this.prisma.deviceConnectionWebhookInbox.update({
          where: { id: inboxId },
          data: {
            processingStatus: DeviceConnectionWebhookProcessingStatus.PROCESSED,
            domainEventId: domainResult.eventId,
            bindingMappingStatus: DeviceConnectionWebhookBindingMappingStatus.RESOLVED,
            processedAt,
          },
        });
        return {
          outcome: 'duplicate',
          inboxId,
          processingStatus: DeviceConnectionWebhookProcessingStatus.PROCESSED,
          eventId: domainResult.eventId,
          eventType,
        };
      }

      const processedAt = new Date();
      await this.prisma.deviceConnectionWebhookInbox.update({
        where: { id: inboxId },
        data: {
          processingStatus: DeviceConnectionWebhookProcessingStatus.PROCESSED,
          domainEventId: domainResult.eventId,
          bindingMappingStatus: DeviceConnectionWebhookBindingMappingStatus.RESOLVED,
          processedAt,
        },
      });
      return {
        outcome: 'created',
        inboxId,
        processingStatus: DeviceConnectionWebhookProcessingStatus.PROCESSED,
        eventId: domainResult.eventId,
        eventType,
      };
    } catch (err: unknown) {
      const errorCode = err instanceof Error ? err.name : 'processing_error';
      const errorMessage = err instanceof Error ? err.message : String(err);
      const failedAt = new Date();
      await this.prisma.deviceConnectionWebhookInbox.update({
        where: { id: inboxId },
        data: {
          processingStatus: DeviceConnectionWebhookProcessingStatus.RETRYABLE_FAILED,
          lastErrorCode: errorCode,
          lastErrorAt: failedAt,
          nextRetryAt: new Date(failedAt.getTime() + RETRY_BACKOFF_MS),
        },
      });
      this.logger.warn(
        `Device connection webhook inbox ${inboxId} processing failed: ${errorMessage}`,
      );
      return {
        outcome: 'retryable_failed',
        inboxId,
        processingStatus: DeviceConnectionWebhookProcessingStatus.RETRYABLE_FAILED,
        eventType,
        errorCode,
      };
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
