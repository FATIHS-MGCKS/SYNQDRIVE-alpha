import { Injectable } from '@nestjs/common';
import {
  DataAuthorizationAuditEventKind,
  DataAuthorizationAuditOutboxStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DATA_AUTHORIZATION_AUDIT_OUTBOX } from './data-authorization-audit.constants';
import { sanitizeAuditPayload } from './data-authorization-audit-sanitize.util';

export interface EnqueueDataAuthorizationAuditInput {
  organizationId: string;
  idempotencyKey: string;
  eventKind: DataAuthorizationAuditEventKind;
  correlationId?: string | null;
  payload: Record<string, unknown>;
  payloadVersion?: number;
}

@Injectable()
export class DataAuthorizationAuditOutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async enqueueInTransaction(tx: Prisma.TransactionClient, input: EnqueueDataAuthorizationAuditInput) {
    const data = {
      organizationId: input.organizationId,
      idempotencyKey: input.idempotencyKey,
      eventKind: input.eventKind,
      correlationId: input.correlationId ?? null,
      payloadVersion: input.payloadVersion ?? DATA_AUTHORIZATION_AUDIT_OUTBOX.payloadVersion,
      payload: sanitizeAuditPayload(input.payload) as Prisma.InputJsonValue,
      status: DataAuthorizationAuditOutboxStatus.PENDING,
      nextRetryAt: new Date(),
    };

    try {
      return await tx.dataAuthorizationAuditOutbox.create({ data });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'P2002') {
        const existing = await tx.dataAuthorizationAuditOutbox.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async enqueue(input: EnqueueDataAuthorizationAuditInput) {
    return this.prisma.$transaction((tx) => this.enqueueInTransaction(tx, input));
  }

  findById(id: string, organizationId?: string) {
    return this.prisma.dataAuthorizationAuditOutbox.findFirst({
      where: { id, ...(organizationId ? { organizationId } : {}) },
    });
  }

  findDueBatch(limit: number, now: Date = new Date()) {
    return this.prisma.dataAuthorizationAuditOutbox.findMany({
      where: {
        status: DataAuthorizationAuditOutboxStatus.PENDING,
        nextRetryAt: { lte: now },
      },
      orderBy: { nextRetryAt: 'asc' },
      take: limit,
    });
  }

  async claimForProcessing(id: string) {
    const result = await this.prisma.dataAuthorizationAuditOutbox.updateMany({
      where: {
        id,
        status: DataAuthorizationAuditOutboxStatus.PENDING,
        nextRetryAt: { lte: new Date() },
      },
      data: {
        status: DataAuthorizationAuditOutboxStatus.PROCESSING,
        attempts: { increment: 1 },
      },
    });
    if (result.count === 0) return null;
    return this.findById(id);
  }

  markProcessed(id: string) {
    return this.prisma.dataAuthorizationAuditOutbox.update({
      where: { id },
      data: {
        status: DataAuthorizationAuditOutboxStatus.PROCESSED,
        processedAt: new Date(),
        errorMessage: null,
      },
    });
  }

  markRetry(id: string, errorMessage: string, nextRetryAt: Date) {
    return this.prisma.dataAuthorizationAuditOutbox.update({
      where: { id },
      data: {
        status: DataAuthorizationAuditOutboxStatus.PENDING,
        nextRetryAt,
        errorMessage: errorMessage.slice(0, 2000),
        processedAt: null,
        deadLetteredAt: null,
      },
    });
  }

  markDeadLetter(id: string, errorMessage: string) {
    return this.prisma.dataAuthorizationAuditOutbox.update({
      where: { id },
      data: {
        status: DataAuthorizationAuditOutboxStatus.DEAD_LETTER,
        deadLetteredAt: new Date(),
        errorMessage: errorMessage.slice(0, 2000),
      },
    });
  }

  async recoverStaleProcessing(staleBefore: Date): Promise<string[]> {
    const stale = await this.prisma.dataAuthorizationAuditOutbox.findMany({
      where: {
        status: DataAuthorizationAuditOutboxStatus.PROCESSING,
        updatedAt: { lt: staleBefore },
      },
      select: { id: true },
    });
    if (stale.length === 0) return [];
    const ids = stale.map((r) => r.id);
    await this.prisma.dataAuthorizationAuditOutbox.updateMany({
      where: { id: { in: ids } },
      data: { status: DataAuthorizationAuditOutboxStatus.PENDING, nextRetryAt: new Date() },
    });
    return ids;
  }

  countBacklog(organizationId?: string) {
    return this.prisma.dataAuthorizationAuditOutbox.count({
      where: {
        ...(organizationId ? { organizationId } : {}),
        status: {
          in: [DataAuthorizationAuditOutboxStatus.PENDING, DataAuthorizationAuditOutboxStatus.DEAD_LETTER],
        },
      },
    });
  }
}
