import { Injectable } from '@nestjs/common';
import {
  DeviceConnectionWebhookInboxStatus,
  DeviceConnectionWebhookMappingStatus,
  DimoDeviceConnectionEventType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

export type CreateDeviceConnectionWebhookInboxInput = {
  organizationId?: string | null;
  vehicleId?: string | null;
  tokenId?: number | null;
  provider?: string;
  providerEventId: string;
  eventType?: DimoDeviceConnectionEventType | null;
  rawPayloadHash: string;
  redactedPayloadJson: Prisma.InputJsonValue;
  observedAt?: Date | null;
  receivedAt?: Date;
  vehicleMappingStatus?: DeviceConnectionWebhookMappingStatus;
  bindingMappingStatus?: DeviceConnectionWebhookMappingStatus;
  dedupBucket?: bigint | null;
  deviceBindingId?: string | null;
  providerDeviceIdHash?: string | null;
};

@Injectable()
export class DeviceConnectionWebhookInboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByProviderEventId(provider: string, providerEventId: string) {
    return this.prisma.deviceConnectionWebhookInbox.findUnique({
      where: {
        provider_providerEventId: { provider, providerEventId },
      },
    });
  }

  findById(id: string) {
    return this.prisma.deviceConnectionWebhookInbox.findUnique({ where: { id } });
  }

  findByIdForOrganization(organizationId: string, id: string) {
    return this.prisma.deviceConnectionWebhookInbox.findFirst({
      where: { id, organizationId },
    });
  }

  async persistOrGet(input: CreateDeviceConnectionWebhookInboxInput) {
    const provider = input.provider ?? 'DIMO';
    const existing = await this.findByProviderEventId(provider, input.providerEventId);
    if (existing) {
      return { inbox: existing, created: false };
    }

    try {
      const inbox = await this.prisma.deviceConnectionWebhookInbox.create({
        data: {
          organizationId: input.organizationId ?? null,
          vehicleId: input.vehicleId ?? null,
          tokenId: input.tokenId ?? null,
          provider,
          providerEventId: input.providerEventId,
          eventType: input.eventType ?? null,
          rawPayloadHash: input.rawPayloadHash,
          redactedPayloadJson: input.redactedPayloadJson,
          observedAt: input.observedAt ?? null,
          receivedAt: input.receivedAt ?? new Date(),
          processingStatus: DeviceConnectionWebhookInboxStatus.RECEIVED,
          vehicleMappingStatus: input.vehicleMappingStatus ?? DeviceConnectionWebhookMappingStatus.UNKNOWN,
          bindingMappingStatus: input.bindingMappingStatus ?? DeviceConnectionWebhookMappingStatus.UNKNOWN,
          dedupBucket: input.dedupBucket ?? null,
          deviceBindingId: input.deviceBindingId ?? null,
          providerDeviceIdHash: input.providerDeviceIdHash ?? null,
        },
      });
      return { inbox, created: true };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const raced = await this.findByProviderEventId(provider, input.providerEventId);
        if (raced) {
          return { inbox: raced, created: false };
        }
      }
      throw err;
    }
  }

  markValidated(
    id: string,
    data: {
      organizationId?: string | null;
      vehicleId?: string | null;
      tokenId?: number | null;
      eventType?: DimoDeviceConnectionEventType | null;
      observedAt?: Date | null;
      vehicleMappingStatus: DeviceConnectionWebhookMappingStatus;
      bindingMappingStatus: DeviceConnectionWebhookMappingStatus;
      dedupBucket?: bigint | null;
      deviceBindingId?: string | null;
      providerDeviceIdHash?: string | null;
    },
  ) {
    return this.prisma.deviceConnectionWebhookInbox.update({
      where: { id },
      data: {
        ...data,
        processingStatus: DeviceConnectionWebhookInboxStatus.VALIDATED,
      },
    });
  }

  markProcessed(id: string, connectionEventId?: string | null) {
    return this.prisma.deviceConnectionWebhookInbox.update({
      where: { id },
      data: {
        processingStatus: DeviceConnectionWebhookInboxStatus.PROCESSED,
        processedAt: new Date(),
        connectionEventId: connectionEventId ?? null,
        lastErrorCode: null,
        lastErrorMessage: null,
        nextRetryAt: null,
      },
    });
  }

  markIgnoredByPolicy(id: string, reason: string) {
    return this.prisma.deviceConnectionWebhookInbox.update({
      where: { id },
      data: {
        processingStatus: DeviceConnectionWebhookInboxStatus.IGNORED_BY_POLICY,
        processedAt: new Date(),
        policyIgnoreReason: reason,
        lastErrorCode: null,
        lastErrorMessage: null,
        nextRetryAt: null,
      },
    });
  }

  markRetryableFailed(
    id: string,
    params: {
      errorCode: string;
      errorMessage: string;
      nextRetryAt: Date;
      incrementAttempts?: boolean;
    },
  ) {
    return this.prisma.deviceConnectionWebhookInbox.update({
      where: { id },
      data: {
        processingStatus: DeviceConnectionWebhookInboxStatus.RETRYABLE_FAILED,
        lastErrorCode: params.errorCode,
        lastErrorMessage: params.errorMessage,
        nextRetryAt: params.nextRetryAt,
        ...(params.incrementAttempts ? { processingAttempts: { increment: 1 } } : {}),
      },
    });
  }

  markPermanentlyFailed(
    id: string,
    params: { errorCode: string; errorMessage: string },
  ) {
    return this.prisma.deviceConnectionWebhookInbox.update({
      where: { id },
      data: {
        processingStatus: DeviceConnectionWebhookInboxStatus.PERMANENTLY_FAILED,
        processedAt: new Date(),
        lastErrorCode: params.errorCode,
        lastErrorMessage: params.errorMessage,
        nextRetryAt: null,
      },
    });
  }

  markDeadLetter(
    id: string,
    params: { errorCode: string; errorMessage: string },
  ) {
    return this.prisma.deviceConnectionWebhookInbox.update({
      where: { id },
      data: {
        processingStatus: DeviceConnectionWebhookInboxStatus.DEAD_LETTER,
        processedAt: new Date(),
        lastErrorCode: params.errorCode,
        lastErrorMessage: params.errorMessage,
        nextRetryAt: null,
      },
    });
  }

  incrementProcessingAttempt(id: string) {
    return this.prisma.deviceConnectionWebhookInbox.update({
      where: { id },
      data: { processingAttempts: { increment: 1 } },
    });
  }
}
