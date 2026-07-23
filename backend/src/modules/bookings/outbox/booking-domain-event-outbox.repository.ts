import { Injectable } from '@nestjs/common';
import {
  BookingDomainEventConsumerReceiptStatus,
  BookingDomainEventOutboxStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  BOOKING_DOMAIN_EVENT_MAX_RETRIES,
  BOOKING_DOMAIN_EVENT_POLL_BATCH_SIZE,
  computeBookingDomainEventNextRetryAt,
  truncateBookingDomainEventError,
} from './booking-domain-event-outbox.constants';

@Injectable()
export class BookingDomainEventOutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.bookingDomainEventOutbox.findUnique({ where: { id } });
  }

  findByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.bookingDomainEventOutbox.findUnique({
      where: { idempotencyKey },
    });
  }

  async nextAggregateVersion(
    tx: Prisma.TransactionClient,
    aggregateId: string,
  ): Promise<number> {
    const latest = await tx.bookingDomainEventOutbox.findFirst({
      where: { aggregateId },
      orderBy: { aggregateVersion: 'desc' },
      select: { aggregateVersion: true },
    });
    return (latest?.aggregateVersion ?? 0) + 1;
  }

  async enqueueInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      eventType: string;
      aggregateId: string;
      organizationId: string;
      payload: Prisma.InputJsonValue;
      correlationId: string;
      causationId?: string | null;
      idempotencyKey: string;
      occurredAt?: Date;
    },
  ) {
    const existing = await tx.bookingDomainEventOutbox.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return existing;

    const aggregateVersion = await this.nextAggregateVersion(tx, input.aggregateId);
    return tx.bookingDomainEventOutbox.create({
      data: {
        eventType: input.eventType,
        aggregateId: input.aggregateId,
        organizationId: input.organizationId,
        aggregateVersion,
        occurredAt: input.occurredAt ?? new Date(),
        payload: input.payload,
        correlationId: input.correlationId,
        causationId: input.causationId ?? null,
        idempotencyKey: input.idempotencyKey,
        status: BookingDomainEventOutboxStatus.PENDING,
      },
    });
  }

  findPendingBatch(limit = BOOKING_DOMAIN_EVENT_POLL_BATCH_SIZE, now = new Date()) {
    return this.prisma.bookingDomainEventOutbox.findMany({
      where: {
        status: BookingDomainEventOutboxStatus.PENDING,
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      orderBy: { occurredAt: 'asc' },
      take: limit,
    });
  }

  countBacklog() {
    return this.prisma.bookingDomainEventOutbox.count({
      where: {
        status: {
          in: [
            BookingDomainEventOutboxStatus.PENDING,
            BookingDomainEventOutboxStatus.FAILED,
            BookingDomainEventOutboxStatus.DEAD_LETTER,
          ],
        },
      },
    });
  }

  async claimForProcessing(id: string, workerId: string, now = new Date()) {
    const result = await this.prisma.bookingDomainEventOutbox.updateMany({
      where: {
        id,
        status: BookingDomainEventOutboxStatus.PENDING,
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      data: {
        status: BookingDomainEventOutboxStatus.PROCESSING,
        lockOwner: workerId,
        lockedAt: now,
        retryCount: { increment: 1 },
      },
    });
    if (result.count === 0) return null;
    return this.findById(id);
  }

  async recoverStaleProcessing(staleBefore: Date): Promise<string[]> {
    const stale = await this.prisma.bookingDomainEventOutbox.findMany({
      where: {
        status: BookingDomainEventOutboxStatus.PROCESSING,
        updatedAt: { lt: staleBefore },
      },
      select: { id: true },
    });
    if (stale.length === 0) return [];

    const ids = stale.map((row) => row.id);
    await this.prisma.bookingDomainEventOutbox.updateMany({
      where: { id: { in: ids } },
      data: {
        status: BookingDomainEventOutboxStatus.PENDING,
        nextRetryAt: new Date(),
        lockOwner: null,
        lockedAt: null,
      },
    });
    return ids;
  }

  markPublished(id: string) {
    const now = new Date();
    return this.prisma.bookingDomainEventOutbox.update({
      where: { id },
      data: {
        status: BookingDomainEventOutboxStatus.PUBLISHED,
        publishedAt: now,
        lastError: null,
        lockOwner: null,
        lockedAt: null,
      },
    });
  }

  async markRetry(id: string, error: string) {
    const row = await this.findById(id);
    if (!row) return { outcome: 'missing' as const };

    const retryCount = row.retryCount ?? 0;
    const safeError = truncateBookingDomainEventError(error);

    if (retryCount >= BOOKING_DOMAIN_EVENT_MAX_RETRIES) {
      await this.prisma.bookingDomainEventOutbox.update({
        where: { id },
        data: {
          status: BookingDomainEventOutboxStatus.DEAD_LETTER,
          lastError: safeError,
          lockOwner: null,
          lockedAt: null,
        },
      });
      return { outcome: 'dead_letter' as const, retryCount };
    }

    const nextRetryAt = computeBookingDomainEventNextRetryAt(retryCount);
    await this.prisma.bookingDomainEventOutbox.update({
      where: { id },
      data: {
        status: BookingDomainEventOutboxStatus.PENDING,
        nextRetryAt,
        lastError: safeError,
        lockOwner: null,
        lockedAt: null,
      },
    });
    return { outcome: 'retry' as const, retryCount, nextRetryAt };
  }

  hasConsumerReceipt(outboxEventId: string, consumerId: string) {
    return this.prisma.bookingDomainEventConsumerReceipt.findUnique({
      where: {
        outboxEventId_consumerId: { outboxEventId, consumerId },
      },
    });
  }

  findConsumerReceipt(outboxEventId: string, consumerId: string) {
    return this.hasConsumerReceipt(outboxEventId, consumerId);
  }

  findConsumerReceiptByBusinessKey(consumerId: string, businessKey: string) {
    return this.prisma.bookingDomainEventConsumerReceipt.findUnique({
      where: {
        consumerId_businessKey: { consumerId, businessKey },
      },
    });
  }

  async allApplicableConsumersTerminal(outboxEventId: string, consumerIds: string[]) {
    if (consumerIds.length === 0) return true;
    const receipts = await this.prisma.bookingDomainEventConsumerReceipt.findMany({
      where: {
        outboxEventId,
        consumerId: { in: consumerIds },
      },
    });
    if (receipts.length !== consumerIds.length) return false;
    const terminal = new Set<BookingDomainEventConsumerReceiptStatus>([
      BookingDomainEventConsumerReceiptStatus.SUCCEEDED,
      BookingDomainEventConsumerReceiptStatus.SKIPPED,
      BookingDomainEventConsumerReceiptStatus.STALE,
      BookingDomainEventConsumerReceiptStatus.FAILED,
    ]);
    return receipts.every((r) => terminal.has(r.status));
  }

  recordConsumerReceipt(input: {
    outboxEventId: string;
    consumerId: string;
    businessKey: string;
    status?: BookingDomainEventConsumerReceiptStatus;
    aggregateVersion?: number | null;
    lastError?: string | null;
    metadata?: Prisma.InputJsonValue | null;
  }) {
    const now = new Date();
    return this.prisma.bookingDomainEventConsumerReceipt.upsert({
      where: {
        outboxEventId_consumerId: {
          outboxEventId: input.outboxEventId,
          consumerId: input.consumerId,
        },
      },
      create: {
        outboxEventId: input.outboxEventId,
        consumerId: input.consumerId,
        businessKey: input.businessKey,
        status: input.status ?? BookingDomainEventConsumerReceiptStatus.SUCCEEDED,
        aggregateVersion: input.aggregateVersion ?? null,
        lastError: input.lastError ?? null,
        metadata: input.metadata ?? undefined,
        processedAt: now,
      },
      update: {
        businessKey: input.businessKey,
        status: input.status ?? BookingDomainEventConsumerReceiptStatus.SUCCEEDED,
        aggregateVersion: input.aggregateVersion ?? null,
        lastError: input.lastError ?? null,
        metadata: input.metadata ?? undefined,
        processedAt: now,
      },
    });
  }

  deletePublishedOlderThan(cutoff: Date) {
    return this.prisma.bookingDomainEventOutbox.deleteMany({
      where: {
        status: BookingDomainEventOutboxStatus.PUBLISHED,
        publishedAt: { lt: cutoff },
      },
    });
  }
}
