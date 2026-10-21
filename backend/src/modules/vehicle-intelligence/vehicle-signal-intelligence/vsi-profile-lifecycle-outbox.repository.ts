import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  Prisma,
  VsiProfileLifecycleOutbox,
  VsiProfileLifecycleOutboxEventType,
  VsiProfileLifecycleOutboxStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  VSI_PROFILE_LIFECYCLE_OUTBOX_CLAIM_LEASE_MS,
  VSI_PROFILE_LIFECYCLE_OUTBOX_MAX_ATTEMPTS,
} from './vsi-profile-lifecycle.constants';

type DbClient = Prisma.TransactionClient | PrismaService;

export type VsiProfileLifecycleClaimedRow = VsiProfileLifecycleOutbox & {
  claimToken: string;
};

@Injectable()
export class VsiProfileLifecycleOutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atomically claim a batch with PROCESSING lease + claim token.
   * Stale PROCESSING rows (expired lease) are reclaimable.
   */
  async claimPendingBatch(
    limit: number,
    _workerId: string,
    now = new Date(),
  ): Promise<VsiProfileLifecycleClaimedRow[]> {
    const leaseUntil = new Date(now.getTime() + VSI_PROFILE_LIFECYCLE_OUTBOX_CLAIM_LEASE_MS);
    const claimed: VsiProfileLifecycleClaimedRow[] = [];

    return this.prisma.$transaction(async (tx) => {
      const candidates = await tx.vsiProfileLifecycleOutbox.findMany({
        where: {
          attempts: { lt: VSI_PROFILE_LIFECYCLE_OUTBOX_MAX_ATTEMPTS },
          OR: [
            {
              status: VsiProfileLifecycleOutboxStatus.PENDING,
              availableAt: { lte: now },
            },
            {
              status: VsiProfileLifecycleOutboxStatus.PROCESSING,
              claimExpiresAt: { lte: now },
            },
          ],
        },
        orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
        take: limit,
      });

      for (const candidate of candidates) {
        const claimToken = randomUUID();
        const result = await tx.vsiProfileLifecycleOutbox.updateMany({
          where: {
            id: candidate.id,
            OR: [
              {
                status: VsiProfileLifecycleOutboxStatus.PENDING,
                availableAt: { lte: now },
              },
              {
                status: VsiProfileLifecycleOutboxStatus.PROCESSING,
                claimExpiresAt: { lte: now },
              },
            ],
          },
          data: {
            status: VsiProfileLifecycleOutboxStatus.PROCESSING,
            claimToken,
            claimExpiresAt: leaseUntil,
            attempts: { increment: 1 },
            updatedAt: now,
          },
        });
        if (result.count === 1) {
          claimed.push({
            ...candidate,
            status: VsiProfileLifecycleOutboxStatus.PROCESSING,
            claimToken,
            claimExpiresAt: leaseUntil,
            attempts: candidate.attempts + 1,
          });
        }
      }
      return claimed;
    });
  }

  async markCompleted(outboxId: string, claimToken: string): Promise<boolean> {
    const result = await this.prisma.vsiProfileLifecycleOutbox.updateMany({
      where: {
        id: outboxId,
        status: VsiProfileLifecycleOutboxStatus.PROCESSING,
        claimToken,
      },
      data: {
        status: VsiProfileLifecycleOutboxStatus.COMPLETED,
        processedAt: new Date(),
        lastError: null,
        claimToken: null,
        claimExpiresAt: null,
      },
    });
    return result.count === 1;
  }

  async markRetry(
    outboxId: string,
    claimToken: string,
    errorMessage: string,
    delayMs: number,
  ): Promise<boolean> {
    const result = await this.prisma.vsiProfileLifecycleOutbox.updateMany({
      where: {
        id: outboxId,
        status: VsiProfileLifecycleOutboxStatus.PROCESSING,
        claimToken,
      },
      data: {
        status: VsiProfileLifecycleOutboxStatus.PENDING,
        lastError: errorMessage.slice(0, 2000),
        availableAt: new Date(Date.now() + delayMs),
        claimToken: null,
        claimExpiresAt: null,
      },
    });
    return result.count === 1;
  }

  async markFailed(outboxId: string, claimToken: string, errorMessage: string): Promise<boolean> {
    const result = await this.prisma.vsiProfileLifecycleOutbox.updateMany({
      where: {
        id: outboxId,
        status: VsiProfileLifecycleOutboxStatus.PROCESSING,
        claimToken,
      },
      data: {
        status: VsiProfileLifecycleOutboxStatus.FAILED,
        lastError: errorMessage.slice(0, 2000),
        processedAt: new Date(),
        claimToken: null,
        claimExpiresAt: null,
      },
    });
    return result.count === 1;
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
