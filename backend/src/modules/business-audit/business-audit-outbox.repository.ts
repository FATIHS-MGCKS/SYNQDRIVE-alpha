import { Injectable } from '@nestjs/common';
import { BusinessAuditOutboxStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  BUSINESS_AUDIT_OUTBOX,
  type BusinessAuditActionCode,
  type BusinessAuditEntityType,
} from './business-audit.constants';
import {
  hashBusinessAuditValue,
  summarizeBusinessAuditValue,
} from './business-audit-sanitize.util';

export interface EnqueueBusinessAuditOutboxInput {
  organizationId: string;
  idempotencyKey: string;
  action: BusinessAuditActionCode;
  actorUserId?: string | null;
  entityType: BusinessAuditEntityType;
  entityId: string;
  correlationId?: string | null;
  before?: unknown;
  after?: unknown;
  diff?: unknown;
  changeReason?: string | null;
  outcome?: string | null;
  description: string;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
  payloadVersion?: number;
}

@Injectable()
export class BusinessAuditOutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async enqueueInTransaction(tx: Prisma.TransactionClient, input: EnqueueBusinessAuditOutboxInput) {
    const sanitizedBefore =
      input.before !== undefined ? summarizeBusinessAuditValue(input.before) : null;
    const sanitizedAfter =
      input.after !== undefined ? summarizeBusinessAuditValue(input.after) : null;
    const sanitizedDiff =
      input.diff !== undefined ? summarizeBusinessAuditValue(input.diff) : null;

    const data = {
      organizationId: input.organizationId,
      idempotencyKey: input.idempotencyKey,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      correlationId: input.correlationId ?? null,
      occurredAt: input.occurredAt ?? new Date(),
      payloadVersion: input.payloadVersion ?? BUSINESS_AUDIT_OUTBOX.payloadVersion,
      beforeHash: hashBusinessAuditValue(input.before),
      beforeSummary: sanitizedBefore,
      afterHash: hashBusinessAuditValue(input.after),
      afterSummary: sanitizedAfter,
      changeReason: input.changeReason?.trim() || null,
      outcome: input.outcome ?? null,
      diffRef: sanitizedDiff,
      payload: {
        description: input.description,
        metadata: input.metadata ?? null,
      } as Prisma.InputJsonValue,
      status: BusinessAuditOutboxStatus.PENDING,
      nextRetryAt: new Date(),
    };

    try {
      return await tx.businessAuditOutbox.create({ data });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'P2002' && input.idempotencyKey) {
        const existing = await tx.businessAuditOutbox.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async enqueue(input: EnqueueBusinessAuditOutboxInput) {
    return this.prisma.$transaction((tx) => this.enqueueInTransaction(tx, input));
  }

  findById(id: string, organizationId?: string) {
    return this.prisma.businessAuditOutbox.findFirst({
      where: {
        id,
        ...(organizationId ? { organizationId } : {}),
      },
    });
  }

  findByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.businessAuditOutbox.findUnique({
      where: { idempotencyKey },
    });
  }

  findDueBatch(limit: number, now: Date = new Date()) {
    return this.prisma.businessAuditOutbox.findMany({
      where: {
        status: BusinessAuditOutboxStatus.PENDING,
        nextRetryAt: { lte: now },
      },
      orderBy: { nextRetryAt: 'asc' },
      take: limit,
    });
  }

  async claimForProcessing(id: string) {
    const result = await this.prisma.businessAuditOutbox.updateMany({
      where: {
        id,
        status: BusinessAuditOutboxStatus.PENDING,
        nextRetryAt: { lte: new Date() },
      },
      data: {
        status: BusinessAuditOutboxStatus.PROCESSING,
        attempts: { increment: 1 },
      },
    });
    if (result.count === 0) return null;
    return this.findById(id);
  }

  markProcessed(id: string) {
    return this.prisma.businessAuditOutbox.update({
      where: { id },
      data: {
        status: BusinessAuditOutboxStatus.PROCESSED,
        processedAt: new Date(),
        errorMessage: null,
      },
    });
  }

  markRetry(id: string, errorMessage: string, nextRetryAt: Date) {
    return this.prisma.businessAuditOutbox.update({
      where: { id },
      data: {
        status: BusinessAuditOutboxStatus.PENDING,
        nextRetryAt,
        errorMessage: errorMessage.slice(0, 2000),
        processedAt: null,
        deadLetteredAt: null,
      },
    });
  }

  markDeadLetter(id: string, errorMessage: string) {
    return this.prisma.businessAuditOutbox.update({
      where: { id },
      data: {
        status: BusinessAuditOutboxStatus.DEAD_LETTER,
        deadLetteredAt: new Date(),
        errorMessage: errorMessage.slice(0, 2000),
      },
    });
  }

  async recoverStaleProcessing(staleBefore: Date): Promise<string[]> {
    const stale = await this.prisma.businessAuditOutbox.findMany({
      where: {
        status: BusinessAuditOutboxStatus.PROCESSING,
        updatedAt: { lt: staleBefore },
      },
      select: { id: true },
    });
    if (stale.length === 0) return [];

    const ids = stale.map((row) => row.id);
    await this.prisma.businessAuditOutbox.updateMany({
      where: { id: { in: ids } },
      data: {
        status: BusinessAuditOutboxStatus.PENDING,
        nextRetryAt: new Date(),
      },
    });
    return ids;
  }
}
