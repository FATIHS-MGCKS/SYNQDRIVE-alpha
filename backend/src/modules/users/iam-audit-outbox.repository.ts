import { Injectable } from '@nestjs/common';
import { IamAuditOutboxStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { UserAccessAuditActionCode } from './user-access-audit.service';
import {
  hashIamAuditValue,
  sanitizeIamAuditValue,
  summarizeIamAuditValue,
} from './iam-audit-sanitize.util';
import { IAM_AUDIT_OUTBOX } from './iam-audit.constants';

export interface EnqueueIamAuditOutboxInput {
  organizationId: string;
  idempotencyKey: string;
  eventType: UserAccessAuditActionCode;
  actorUserId?: string;
  subjectUserId?: string;
  membershipId?: string;
  targetInviteId?: string;
  targetRoleId?: string;
  description: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  metadata?: Record<string, unknown>;
  route?: string;
  ipAddress?: string;
  userAgent?: string;
  level?: 'INFO' | 'WARN' | 'CRITICAL';
  occurredAt?: Date;
  payloadVersion?: number;
}

@Injectable()
export class IamAuditOutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  enqueueInTransaction(tx: Prisma.TransactionClient, input: EnqueueIamAuditOutboxInput) {
    const sanitizedBefore = input.before !== undefined ? sanitizeIamAuditValue(input.before) : undefined;
    const sanitizedAfter = input.after !== undefined ? sanitizeIamAuditValue(input.after) : undefined;
    const sanitizedMetadata = input.metadata
      ? (sanitizeIamAuditValue(input.metadata) as Record<string, unknown>)
      : undefined;

    return tx.iamAuditOutbox.create({
      data: {
        organizationId: input.organizationId,
        idempotencyKey: input.idempotencyKey,
        actorUserId: input.actorUserId ?? null,
        subjectUserId: input.subjectUserId ?? null,
        membershipId: input.membershipId ?? null,
        eventType: input.eventType,
        occurredAt: input.occurredAt ?? new Date(),
        payloadVersion: input.payloadVersion ?? IAM_AUDIT_OUTBOX.payloadVersion,
        beforeHash: hashIamAuditValue(sanitizedBefore),
        beforeSummary: summarizeIamAuditValue(sanitizedBefore),
        afterHash: hashIamAuditValue(sanitizedAfter),
        afterSummary: summarizeIamAuditValue(sanitizedAfter),
        reason: input.reason ?? null,
        payload: {
          description: input.description,
          targetInviteId: input.targetInviteId ?? null,
          targetRoleId: input.targetRoleId ?? null,
          route: input.route ?? null,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
          level: input.level ?? null,
          metadata: sanitizedMetadata ?? null,
        } as Prisma.InputJsonValue,
        status: IamAuditOutboxStatus.PENDING,
        nextRetryAt: new Date(),
      },
    });
  }

  findById(id: string, organizationId?: string) {
    return this.prisma.iamAuditOutbox.findFirst({
      where: {
        id,
        ...(organizationId ? { organizationId } : {}),
      },
    });
  }

  findByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.iamAuditOutbox.findUnique({
      where: { idempotencyKey },
    });
  }

  findDueBatch(limit: number, now: Date = new Date()) {
    return this.prisma.iamAuditOutbox.findMany({
      where: {
        status: IamAuditOutboxStatus.PENDING,
        nextRetryAt: { lte: now },
      },
      orderBy: { nextRetryAt: 'asc' },
      take: limit,
    });
  }

  async claimForProcessing(id: string) {
    const result = await this.prisma.iamAuditOutbox.updateMany({
      where: {
        id,
        status: IamAuditOutboxStatus.PENDING,
        nextRetryAt: { lte: new Date() },
      },
      data: {
        status: IamAuditOutboxStatus.PROCESSING,
        attempts: { increment: 1 },
      },
    });
    if (result.count === 0) return null;
    return this.findById(id);
  }

  markProcessed(id: string) {
    return this.prisma.iamAuditOutbox.update({
      where: { id },
      data: {
        status: IamAuditOutboxStatus.PROCESSED,
        processedAt: new Date(),
        errorMessage: null,
      },
    });
  }

  markRetry(id: string, errorMessage: string, nextRetryAt: Date) {
    return this.prisma.iamAuditOutbox.update({
      where: { id },
      data: {
        status: IamAuditOutboxStatus.PENDING,
        nextRetryAt,
        errorMessage: errorMessage.slice(0, 2000),
        processedAt: null,
        deadLetteredAt: null,
      },
    });
  }

  markDeadLetter(id: string, errorMessage: string) {
    return this.prisma.iamAuditOutbox.update({
      where: { id },
      data: {
        status: IamAuditOutboxStatus.DEAD_LETTER,
        deadLetteredAt: new Date(),
        errorMessage: errorMessage.slice(0, 2000),
      },
    });
  }

  async recoverStaleProcessing(staleBefore: Date): Promise<string[]> {
    const stale = await this.prisma.iamAuditOutbox.findMany({
      where: {
        status: IamAuditOutboxStatus.PROCESSING,
        updatedAt: { lt: staleBefore },
      },
      select: { id: true },
    });
    if (stale.length === 0) return [];

    const ids = stale.map((row) => row.id);
    await this.prisma.iamAuditOutbox.updateMany({
      where: { id: { in: ids } },
      data: {
        status: IamAuditOutboxStatus.PENDING,
        nextRetryAt: new Date(),
      },
    });
    return ids;
  }

  countBacklog() {
    return this.prisma.iamAuditOutbox.count({
      where: {
        status: {
          in: [IamAuditOutboxStatus.PENDING, IamAuditOutboxStatus.DEAD_LETTER],
        },
      },
    });
  }
}
