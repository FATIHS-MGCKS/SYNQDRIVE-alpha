import { Injectable } from '@nestjs/common';
import {
  VehicleRegistryLifecycleOutboxStatus,
  type VehicleRegistryLifecycleOutbox,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  SUPPORTED_REGISTRY_LIFECYCLE_HANDLER_EVENT_TYPES,
  VEHICLE_REGISTRY_LIFECYCLE_OUTBOX_CLAIM_LEASE_MS,
} from './vehicle-registry-lifecycle-outbox.constants';

@Injectable()
export class VehicleRegistryLifecycleOutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async claimPendingHandledEvents(
    limit: number,
    workerId: string,
    now = new Date(),
  ): Promise<VehicleRegistryLifecycleOutbox[]> {
    const candidates = await this.prisma.vehicleRegistryLifecycleOutbox.findMany({
      where: {
        status: VehicleRegistryLifecycleOutboxStatus.PENDING,
        eventType: { in: [...SUPPORTED_REGISTRY_LIFECYCLE_HANDLER_EVENT_TYPES] },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      orderBy: { occurredAt: 'asc' },
      take: limit,
    });

    const leaseUntil = new Date(now.getTime() + VEHICLE_REGISTRY_LIFECYCLE_OUTBOX_CLAIM_LEASE_MS);
    const claimed: VehicleRegistryLifecycleOutbox[] = [];

    for (const candidate of candidates) {
      const result = await this.prisma.vehicleRegistryLifecycleOutbox.updateMany({
        where: {
          id: candidate.id,
          status: VehicleRegistryLifecycleOutboxStatus.PENDING,
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
        },
        data: {
          nextRetryAt: leaseUntil,
        },
      });
      if (result.count > 0) {
        claimed.push({ ...candidate, nextRetryAt: leaseUntil });
      }
    }

    return claimed;
  }

  async claimRowById(outboxId: string, _workerId: string, now = new Date()): Promise<boolean> {
    const leaseUntil = new Date(now.getTime() + VEHICLE_REGISTRY_LIFECYCLE_OUTBOX_CLAIM_LEASE_MS);
    const result = await this.prisma.vehicleRegistryLifecycleOutbox.updateMany({
      where: {
        id: outboxId,
        status: VehicleRegistryLifecycleOutboxStatus.PENDING,
        eventType: { in: [...SUPPORTED_REGISTRY_LIFECYCLE_HANDLER_EVENT_TYPES] },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      data: {
        nextRetryAt: leaseUntil,
      },
    });
    return result.count > 0;
  }

  async markPublishedFromPending(outboxId: string, now = new Date()): Promise<boolean> {
    const result = await this.prisma.vehicleRegistryLifecycleOutbox.updateMany({
      where: {
        id: outboxId,
        status: VehicleRegistryLifecycleOutboxStatus.PENDING,
      },
      data: {
        status: VehicleRegistryLifecycleOutboxStatus.PUBLISHED,
        publishedAt: now,
        lastError: null,
        nextRetryAt: null,
      },
    });
    return result.count > 0;
  }

  async markRetryFromPending(
    outboxId: string,
    input: { retryCount: number; lastError: string; nextRetryAt: Date | null },
  ): Promise<boolean> {
    const result = await this.prisma.vehicleRegistryLifecycleOutbox.updateMany({
      where: {
        id: outboxId,
        status: VehicleRegistryLifecycleOutboxStatus.PENDING,
      },
      data: {
        status: VehicleRegistryLifecycleOutboxStatus.PENDING,
        retryCount: input.retryCount,
        lastError: input.lastError.slice(0, 2000),
        nextRetryAt: input.nextRetryAt,
      },
    });
    return result.count > 0;
  }

  async markFailedFromPending(
    outboxId: string,
    input: { retryCount: number; lastError: string },
  ): Promise<boolean> {
    const result = await this.prisma.vehicleRegistryLifecycleOutbox.updateMany({
      where: {
        id: outboxId,
        status: VehicleRegistryLifecycleOutboxStatus.PENDING,
      },
      data: {
        status: VehicleRegistryLifecycleOutboxStatus.FAILED,
        retryCount: input.retryCount,
        lastError: input.lastError.slice(0, 2000),
        nextRetryAt: null,
      },
    });
    return result.count > 0;
  }
}
