import { Injectable } from '@nestjs/common';
import {
  DeviceConnectionEpisodeResolutionOutboxStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

const CLAIMABLE_STATUSES: DeviceConnectionEpisodeResolutionOutboxStatus[] = [
  DeviceConnectionEpisodeResolutionOutboxStatus.PENDING,
  DeviceConnectionEpisodeResolutionOutboxStatus.RETRYABLE_FAILED,
];

@Injectable()
export class DeviceConnectionEpisodeResolutionOutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.deviceConnectionEpisodeResolutionOutbox.findUnique({ where: { id } });
  }

  findClaimableBatch(limit: number, now: Date = new Date()) {
    return this.prisma.deviceConnectionEpisodeResolutionOutbox.findMany({
      where: {
        status: { in: CLAIMABLE_STATUSES },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      orderBy: [{ createdAt: 'asc' }],
      take: limit,
      select: { id: true },
    });
  }

  findStaleProcessingBatch(staleBefore: Date, limit: number) {
    return this.prisma.deviceConnectionEpisodeResolutionOutbox.findMany({
      where: {
        status: DeviceConnectionEpisodeResolutionOutboxStatus.PROCESSING,
        updatedAt: { lt: staleBefore },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true },
    });
  }

  async claimForProcessing(id: string, now: Date = new Date()) {
    const result = await this.prisma.deviceConnectionEpisodeResolutionOutbox.updateMany({
      where: {
        id,
        status: { in: CLAIMABLE_STATUSES },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      data: {
        status: DeviceConnectionEpisodeResolutionOutboxStatus.PROCESSING,
        processingAttempts: { increment: 1 },
      },
    });
    if (result.count === 0) return null;
    return this.findById(id);
  }

  async markCompleted(id: string) {
    return this.prisma.deviceConnectionEpisodeResolutionOutbox.update({
      where: { id },
      data: {
        status: DeviceConnectionEpisodeResolutionOutboxStatus.COMPLETED,
        processedAt: new Date(),
        nextRetryAt: null,
        lastErrorCode: null,
        lastErrorAt: null,
      },
    });
  }

  async markFailed(id: string, input: { errorCode: string; errorMessage?: string }) {
    const failedAt = new Date();
    return this.prisma.deviceConnectionEpisodeResolutionOutbox.update({
      where: { id },
      data: {
        status: DeviceConnectionEpisodeResolutionOutboxStatus.FAILED,
        lastErrorCode: input.errorCode,
        lastErrorAt: failedAt,
        processedAt: failedAt,
        nextRetryAt: null,
      },
    });
  }

  async markRetryableFailed(
    id: string,
    input: { errorCode: string; errorMessage: string; nextRetryAt: Date },
  ) {
    return this.prisma.deviceConnectionEpisodeResolutionOutbox.update({
      where: { id },
      data: {
        status: DeviceConnectionEpisodeResolutionOutboxStatus.RETRYABLE_FAILED,
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
    return this.prisma.deviceConnectionEpisodeResolutionOutbox.update({
      where: { id },
      data: {
        status: DeviceConnectionEpisodeResolutionOutboxStatus.DEAD_LETTER,
        lastErrorCode: input.errorCode,
        lastErrorAt: deadLetteredAt,
        deadLetteredAt,
        nextRetryAt: null,
      },
    });
  }

  async releaseStaleProcessing(id: string) {
    return this.prisma.deviceConnectionEpisodeResolutionOutbox.updateMany({
      where: {
        id,
        status: DeviceConnectionEpisodeResolutionOutboxStatus.PROCESSING,
      },
      data: {
        status: DeviceConnectionEpisodeResolutionOutboxStatus.RETRYABLE_FAILED,
        lastErrorCode: 'processing_stale',
        lastErrorAt: new Date(),
        nextRetryAt: new Date(),
      },
    });
  }

  loadEpisodeForOutbox(input: {
    organizationId: string;
    vehicleId: string;
    episodeId: string;
  }) {
    return this.prisma.deviceConnectionEpisode.findFirst({
      where: {
        id: input.episodeId,
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      },
      select: {
        id: true,
        status: true,
        stateVersion: true,
        resolutionMethod: true,
        resolutionEvidenceAt: true,
        deviceBindingId: true,
        provider: true,
        vehicle: {
          select: {
            licensePlate: true,
            make: true,
            model: true,
          },
        },
      },
    });
  }

  loadBindingState(deviceBindingId: string | null) {
    if (!deviceBindingId) return Promise.resolve(null);
    return this.prisma.vehicleDataSourceLink.findUnique({
      where: { id: deviceBindingId },
      select: {
        id: true,
        isActive: true,
        sourceSubtype: true,
        provider: true,
      },
    });
  }
}

export type ResolutionOutboxRow = NonNullable<
  Awaited<ReturnType<DeviceConnectionEpisodeResolutionOutboxRepository['findById']>>
>;

export function resolveOutboxErrorCode(err: unknown): string {
  if (err instanceof Error && err.name) return err.name;
  return 'processing_error';
}

export function resolveOutboxErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function computeOutboxBackoffMs(baseBackoffMs: number, attempt: number): number {
  return baseBackoffMs * 2 ** Math.max(0, attempt - 1);
}
