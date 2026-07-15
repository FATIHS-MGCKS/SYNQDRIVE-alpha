import { Injectable } from '@nestjs/common';
import {
  BillingDomainEventOutboxDeliveryStatus,
  BillingDomainEventOutboxStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  BILLING_OUTBOX_BATCH_SIZE,
  BILLING_OUTBOX_DEFAULT_CONSUMER_ID,
  BILLING_OUTBOX_EMAIL_CONSUMER_ID,
  BILLING_OUTBOX_MAX_RETRIES,
  computeBillingOutboxNextRetryAt,
  truncateBillingOutboxError,
} from './domain/billing-outbox';

export interface ClaimedBillingOutboxDelivery {
  id: string;
  consumerId: string;
  outboxEventId: string;
  retryCount: number;
  outboxEvent: {
    id: string;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    organizationId: string | null;
    payload: Prisma.JsonValue;
    payloadVersion: number;
    occurredAt: Date;
    status: BillingDomainEventOutboxStatus;
    idempotencyKey: string;
  };
}

@Injectable()
export class BillingDomainEventOutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async claimPendingDeliveries(
    limit = BILLING_OUTBOX_BATCH_SIZE,
    workerId: string,
    consumerId: string = BILLING_OUTBOX_DEFAULT_CONSUMER_ID,
    now = new Date(),
  ): Promise<ClaimedBillingOutboxDelivery[]> {
    const candidates = await this.prisma.billingDomainEventOutboxDelivery.findMany({
      where: {
        consumerId,
        status: BillingDomainEventOutboxDeliveryStatus.PENDING,
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
        outboxEvent: {
          status: {
            in: [
              BillingDomainEventOutboxStatus.PENDING,
              BillingDomainEventOutboxStatus.FAILED,
            ],
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: { outboxEvent: true },
    });

    const claimed: ClaimedBillingOutboxDelivery[] = [];
    for (const candidate of candidates) {
      const result = await this.prisma.billingDomainEventOutboxDelivery.updateMany({
        where: {
          id: candidate.id,
          status: BillingDomainEventOutboxDeliveryStatus.PENDING,
        },
        data: {
          status: BillingDomainEventOutboxDeliveryStatus.PROCESSING,
          lockOwner: workerId,
          lockedAt: now,
        },
      });
      if (result.count > 0) {
        claimed.push(candidate as ClaimedBillingOutboxDelivery);
      }
    }
    return claimed;
  }

  async markDeliveryDelivered(deliveryId: string, outboxEventId: string) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.billingDomainEventOutboxDelivery.update({
        where: { id: deliveryId },
        data: {
          status: BillingDomainEventOutboxDeliveryStatus.DELIVERED,
          deliveredAt: now,
          lockOwner: null,
          lockedAt: null,
          lastError: null,
        },
      });

      await this.syncOutboxStatusFromDeliveries(tx, outboxEventId, now);

      const remaining = await tx.billingDomainEventOutboxDelivery.count({
        where: {
          outboxEventId,
          status: {
            in: [
              BillingDomainEventOutboxDeliveryStatus.PENDING,
              BillingDomainEventOutboxDeliveryStatus.PROCESSING,
            ],
          },
        },
      });

      return remaining === 0;
    });
  }

  async markDeliveryRetry(deliveryId: string, outboxEventId: string, error: string) {
    const delivery = await this.prisma.billingDomainEventOutboxDelivery.findUnique({
      where: { id: deliveryId },
    });
    if (!delivery) {
      return { outcome: 'missing' as const };
    }

    const nextRetryCount = (delivery.retryCount ?? 0) + 1;
    const safeError = truncateBillingOutboxError(error);

    if (nextRetryCount >= BILLING_OUTBOX_MAX_RETRIES) {
      await this.prisma.$transaction(async (tx) => {
        await tx.billingDomainEventOutboxDelivery.update({
          where: { id: deliveryId },
          data: {
            status: BillingDomainEventOutboxDeliveryStatus.DEAD_LETTER,
            retryCount: nextRetryCount,
            lastError: safeError,
            lockOwner: null,
            lockedAt: null,
          },
        });
        await this.syncOutboxStatusFromDeliveries(tx, outboxEventId, new Date());
      });
      return { outcome: 'dead_letter' as const, retryCount: nextRetryCount };
    }

    const nextRetryAt = computeBillingOutboxNextRetryAt(nextRetryCount);
    await this.prisma.billingDomainEventOutboxDelivery.update({
      where: { id: deliveryId },
      data: {
        status: BillingDomainEventOutboxDeliveryStatus.PENDING,
        retryCount: nextRetryCount,
        nextRetryAt,
        lastError: safeError,
        lockOwner: null,
        lockedAt: null,
      },
    });

    return { outcome: 'retry' as const, retryCount: nextRetryCount, nextRetryAt };
  }

  async findEmailDeliveryById(deliveryId: string) {
    const row = await this.prisma.billingDomainEventOutboxDelivery.findFirst({
      where: { id: deliveryId, consumerId: BILLING_OUTBOX_EMAIL_CONSUMER_ID },
      include: {
        outboxEvent: true,
        outboundEmails: {
          include: {
            attachments: true,
            events: { orderBy: { occurredAt: 'asc' } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!row) return null;
    return {
      ...row,
      outboundEmail: row.outboundEmails[0] ?? null,
    };
  }

  async listEmailDeliveries(params: {
    organizationId?: string;
    status?: BillingDomainEventOutboxDeliveryStatus;
    skip: number;
    take: number;
  }) {
    const where = {
      consumerId: BILLING_OUTBOX_EMAIL_CONSUMER_ID,
      ...(params.status ? { status: params.status } : {}),
      ...(params.organizationId
        ? { outboxEvent: { organizationId: params.organizationId } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.billingDomainEventOutboxDelivery.findMany({
        where,
        include: {
          outboxEvent: true,
          outboundEmails: {
            include: {
              attachments: true,
              events: { orderBy: { occurredAt: 'asc' } },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.billingDomainEventOutboxDelivery.count({ where }),
    ]);
    return { rows: rows.map((row) => ({ ...row, outboundEmail: row.outboundEmails[0] ?? null })), total };
  }

  async requeueDeadLetterDelivery(deliveryId: string) {
    const result = await this.prisma.billingDomainEventOutboxDelivery.updateMany({
      where: {
        id: deliveryId,
        consumerId: BILLING_OUTBOX_EMAIL_CONSUMER_ID,
        status: BillingDomainEventOutboxDeliveryStatus.DEAD_LETTER,
      },
      data: {
        status: BillingDomainEventOutboxDeliveryStatus.PENDING,
        retryCount: 0,
        nextRetryAt: new Date(),
        lastError: null,
        lockOwner: null,
        lockedAt: null,
        deliveredAt: null,
      },
    });
    return result.count > 0;
  }

  private async syncOutboxStatusFromDeliveries(
    tx: Prisma.TransactionClient,
    outboxEventId: string,
    now: Date,
  ) {
    const deliveries = await tx.billingDomainEventOutboxDelivery.findMany({
      where: { outboxEventId },
    });
    const inFlight = deliveries.some(
      (row) =>
        row.status === BillingDomainEventOutboxDeliveryStatus.PENDING
        || row.status === BillingDomainEventOutboxDeliveryStatus.PROCESSING,
    );
    if (inFlight) {
      return;
    }

    const allDelivered = deliveries.every(
      (row) => row.status === BillingDomainEventOutboxDeliveryStatus.DELIVERED,
    );
    const hasDeadLetter = deliveries.some(
      (row) => row.status === BillingDomainEventOutboxDeliveryStatus.DEAD_LETTER,
    );

    await tx.billingDomainEventOutbox.update({
      where: { id: outboxEventId },
      data: {
        status: allDelivered
          ? BillingDomainEventOutboxStatus.PUBLISHED
          : hasDeadLetter
            ? BillingDomainEventOutboxStatus.DEAD_LETTER
            : BillingDomainEventOutboxStatus.FAILED,
        publishedAt: allDelivered ? now : null,
        lockOwner: null,
        lockedAt: null,
      },
    });
  }
}
