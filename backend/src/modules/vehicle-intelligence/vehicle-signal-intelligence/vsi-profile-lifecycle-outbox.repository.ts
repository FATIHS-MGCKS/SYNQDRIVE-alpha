import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  Prisma,
  VsiProfileLifecycleOutboxEventType,
  VsiProfileLifecycleOutboxStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { VSI_PROFILE_LIFECYCLE_OUTBOX_MAX_ATTEMPTS } from './vsi-profile-lifecycle.constants';

type DbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class VsiProfileLifecycleOutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async claimPendingBatch(limit: number, workerId: string) {
    const now = new Date();
    const candidates = await this.prisma.vsiProfileLifecycleOutbox.findMany({
      where: {
        status: VsiProfileLifecycleOutboxStatus.PENDING,
        availableAt: { lte: now },
        attempts: { lt: VSI_PROFILE_LIFECYCLE_OUTBOX_MAX_ATTEMPTS },
      },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
      take: limit,
      select: { id: true },
    });

    const claimed: string[] = [];
    for (const row of candidates) {
      const updated = await this.prisma.vsiProfileLifecycleOutbox.updateMany({
        where: {
          id: row.id,
          status: VsiProfileLifecycleOutboxStatus.PENDING,
        },
        data: {
          attempts: { increment: 1 },
          updatedAt: now,
        },
      });
      if (updated.count === 1) {
        claimed.push(row.id);
      }
    }
    if (claimed.length === 0) {
      return [];
    }
    return this.prisma.vsiProfileLifecycleOutbox.findMany({
      where: { id: { in: claimed } },
      orderBy: { occurredAt: 'asc' },
    });
  }

  async markCompleted(outboxId: string): Promise<void> {
    await this.prisma.vsiProfileLifecycleOutbox.update({
      where: { id: outboxId },
      data: {
        status: VsiProfileLifecycleOutboxStatus.COMPLETED,
        processedAt: new Date(),
        lastError: null,
      },
    });
  }

  async markRetry(outboxId: string, errorMessage: string, delayMs: number): Promise<void> {
    await this.prisma.vsiProfileLifecycleOutbox.update({
      where: { id: outboxId },
      data: {
        status: VsiProfileLifecycleOutboxStatus.PENDING,
        lastError: errorMessage.slice(0, 2000),
        availableAt: new Date(Date.now() + delayMs),
      },
    });
  }

  async markFailed(outboxId: string, errorMessage: string): Promise<void> {
    await this.prisma.vsiProfileLifecycleOutbox.update({
      where: { id: outboxId },
      data: {
        status: VsiProfileLifecycleOutboxStatus.FAILED,
        lastError: errorMessage.slice(0, 2000),
        processedAt: new Date(),
      },
    });
  }

  async enqueue(
    input: {
      organizationId: string;
      vehicleId: string;
      providerSourceLinkId?: string | null;
      eventType: VsiProfileLifecycleOutboxEventType;
      idempotencyKey: string;
      occurredAt: Date;
      payload: Prisma.InputJsonValue;
    },
    client: DbClient = this.prisma,
  ): Promise<{ created: boolean; outboxId: string }> {
    const id = randomUUID();
    try {
      const row = await client.vsiProfileLifecycleOutbox.create({
        data: {
          id,
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          providerSourceLinkId: input.providerSourceLinkId ?? null,
          eventType: input.eventType,
          idempotencyKey: input.idempotencyKey,
          payloadVersion: 1,
          payload: input.payload,
          occurredAt: input.occurredAt,
        },
      });
      return { created: true, outboxId: row.id };
    } catch (error) {
      if (!isUniqueViolation(error, 'idempotency_key')) {
        throw error;
      }
      const existing = await client.vsiProfileLifecycleOutbox.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (!existing) {
        throw error;
      }
      return { created: false, outboxId: existing.id };
    }
  }
}

function isUniqueViolation(error: unknown, field: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002' &&
    JSON.stringify((error as { meta?: { target?: string[] } }).meta?.target ?? []).includes(field)
  );
}
