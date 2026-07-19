import { Injectable } from '@nestjs/common';
import {
  DeviceConnectionWebhookBindingMappingStatus,
  DeviceConnectionWebhookProcessingStatus,
  DeviceConnectionWebhookVehicleMappingStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

const CLAIMABLE_STATUSES: DeviceConnectionWebhookProcessingStatus[] = [
  DeviceConnectionWebhookProcessingStatus.RECEIVED,
  DeviceConnectionWebhookProcessingStatus.VALIDATED,
  DeviceConnectionWebhookProcessingStatus.RETRYABLE_FAILED,
];

const REPLAYABLE_STATUSES: DeviceConnectionWebhookProcessingStatus[] = [
  DeviceConnectionWebhookProcessingStatus.RETRYABLE_FAILED,
  DeviceConnectionWebhookProcessingStatus.DEAD_LETTER,
];

@Injectable()
export class DeviceConnectionWebhookInboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.deviceConnectionWebhookInbox.findUnique({ where: { id } });
  }

  findByIdForOrganization(id: string, organizationId: string) {
    return this.prisma.deviceConnectionWebhookInbox.findFirst({
      where: { id, organizationId },
    });
  }

  findVehicleByTokenId(tokenId: number) {
    return this.prisma.vehicle.findFirst({
      where: { dimoVehicle: { tokenId } },
      select: { id: true, organizationId: true },
    });
  }

  findRetryableBatch(limit: number, now: Date = new Date()) {
    return this.prisma.deviceConnectionWebhookInbox.findMany({
      where: {
        processingStatus: DeviceConnectionWebhookProcessingStatus.RETRYABLE_FAILED,
        nextRetryAt: { lte: now },
      },
      orderBy: { nextRetryAt: 'asc' },
      take: limit,
      select: { id: true },
    });
  }

  findStaleInFlightBatch(staleBefore: Date, limit: number) {
    return this.prisma.deviceConnectionWebhookInbox.findMany({
      where: {
        processingStatus: {
          in: [
            DeviceConnectionWebhookProcessingStatus.RECEIVED,
            DeviceConnectionWebhookProcessingStatus.VALIDATED,
          ],
        },
        updatedAt: { lt: staleBefore },
      },
      orderBy: { updatedAt: 'asc' },
      take: limit,
      select: { id: true },
    });
  }

  async claimForProcessing(id: string, now: Date = new Date()) {
    const result = await this.prisma.deviceConnectionWebhookInbox.updateMany({
      where: {
        id,
        processingStatus: { in: CLAIMABLE_STATUSES },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      data: {
        processingAttempts: { increment: 1 },
      },
    });
    if (result.count === 0) return null;
    return this.findById(id);
  }

  async markValidated(
    id: string,
    input: {
      organizationId: string;
      vehicleId: string;
    },
  ) {
    return this.prisma.deviceConnectionWebhookInbox.update({
      where: { id },
      data: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        vehicleMappingStatus: DeviceConnectionWebhookVehicleMappingStatus.RESOLVED,
        processingStatus: DeviceConnectionWebhookProcessingStatus.VALIDATED,
      },
    });
  }

  async markProcessed(
    id: string,
    input: {
      domainEventId?: string | null;
      bindingMappingStatus?: DeviceConnectionWebhookBindingMappingStatus;
    } = {},
  ) {
    return this.prisma.deviceConnectionWebhookInbox.update({
      where: { id },
      data: {
        processingStatus: DeviceConnectionWebhookProcessingStatus.PROCESSED,
        domainEventId: input.domainEventId ?? undefined,
        bindingMappingStatus:
          input.bindingMappingStatus ?? DeviceConnectionWebhookBindingMappingStatus.RESOLVED,
        processedAt: new Date(),
        nextRetryAt: null,
      },
    });
  }

  async markIgnoredByPolicy(id: string, policyIgnoreReason: string) {
    return this.prisma.deviceConnectionWebhookInbox.update({
      where: { id },
      data: {
        processingStatus: DeviceConnectionWebhookProcessingStatus.IGNORED_BY_POLICY,
        policyIgnoreReason,
        bindingMappingStatus: DeviceConnectionWebhookBindingMappingStatus.RESOLVED,
        processedAt: new Date(),
        nextRetryAt: null,
      },
    });
  }

  async markPermanentlyFailed(
    id: string,
    input: { errorCode: string; vehicleMappingStatus?: DeviceConnectionWebhookVehicleMappingStatus },
  ) {
    const failedAt = new Date();
    return this.prisma.deviceConnectionWebhookInbox.update({
      where: { id },
      data: {
        processingStatus: DeviceConnectionWebhookProcessingStatus.PERMANENTLY_FAILED,
        lastErrorCode: input.errorCode,
        lastErrorAt: failedAt,
        processedAt: failedAt,
        nextRetryAt: null,
        vehicleMappingStatus:
          input.vehicleMappingStatus ?? DeviceConnectionWebhookVehicleMappingStatus.UNKNOWN_VEHICLE,
      },
    });
  }

  async markRetryableFailed(
    id: string,
    input: { errorCode: string; errorMessage: string; nextRetryAt: Date },
  ) {
    return this.prisma.deviceConnectionWebhookInbox.update({
      where: { id },
      data: {
        processingStatus: DeviceConnectionWebhookProcessingStatus.RETRYABLE_FAILED,
        lastErrorCode: input.errorCode,
        lastErrorAt: new Date(),
        nextRetryAt: input.nextRetryAt,
      },
    });
  }

  async markDeadLetter(
    id: string,
    input: { errorCode: string; errorMessage: string },
  ) {
    const deadLetteredAt = new Date();
    return this.prisma.deviceConnectionWebhookInbox.update({
      where: { id },
      data: {
        processingStatus: DeviceConnectionWebhookProcessingStatus.DEAD_LETTER,
        lastErrorCode: input.errorCode,
        lastErrorAt: deadLetteredAt,
        deadLetteredAt,
        nextRetryAt: null,
      },
    });
  }

  async requeueForReplay(id: string, organizationId: string) {
    const result = await this.prisma.deviceConnectionWebhookInbox.updateMany({
      where: {
        id,
        organizationId,
        processingStatus: { in: REPLAYABLE_STATUSES },
      },
      data: {
        processingStatus: DeviceConnectionWebhookProcessingStatus.RECEIVED,
        nextRetryAt: null,
        deadLetteredAt: null,
        processedAt: null,
        lastErrorCode: null,
        lastErrorAt: null,
      },
    });
    return result.count > 0;
  }

  countDeadLetterBacklog() {
    return this.prisma.deviceConnectionWebhookInbox.count({
      where: { processingStatus: DeviceConnectionWebhookProcessingStatus.DEAD_LETTER },
    });
  }
}
