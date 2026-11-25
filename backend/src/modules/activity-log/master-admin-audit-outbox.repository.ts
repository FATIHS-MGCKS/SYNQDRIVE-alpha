import { Injectable } from '@nestjs/common';
import {
  MasterAdminAuditOutboxStatus,
  MasterAdminAuditScope,
  Prisma,
  type MasterAdminAuditOutbox,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { MASTER_ADMIN_AUDIT_OUTBOX } from './master-admin-audit-outbox.constants';
import type { MasterAdminAuditRecordInput } from './master-admin-audit.contract';
import { sanitizeMasterAdminAuditRecordInput } from './master-admin-audit-privacy.util';

export interface EnqueueMasterAdminAuditOutboxInput {
  idempotencyKey: string;
  envelope: MasterAdminAuditRecordInput;
  occurredAt: Date;
  auditScope: MasterAdminAuditScope;
  organizationContextId?: string | null;
}

@Injectable()
export class MasterAdminAuditOutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async enqueueInTransaction(
    tx: Prisma.TransactionClient,
    input: EnqueueMasterAdminAuditOutboxInput,
  ): Promise<MasterAdminAuditOutbox> {
    const envelope = sanitizeMasterAdminAuditRecordInput(input.envelope);
    const existing = await tx.masterAdminAuditOutbox.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return existing;
    }

    return tx.masterAdminAuditOutbox.create({
      data: {
        idempotencyKey: input.idempotencyKey,
        auditScope: input.auditScope,
        organizationContextId: input.organizationContextId?.trim() || null,
        actorUserId: envelope.actorUserId ?? null,
        subjectUserId:
          typeof envelope.metadata?.targetUserId === 'string'
            ? envelope.metadata.targetUserId
            : null,
        auditAction: envelope.auditAction,
        occurredAt: input.occurredAt,
        payloadVersion: MASTER_ADMIN_AUDIT_OUTBOX.payloadVersion,
        payload: {
          masterAdminAuditEnvelope: envelope,
        } as unknown as Prisma.InputJsonValue,
        status: MasterAdminAuditOutboxStatus.PENDING,
        nextRetryAt: new Date(),
      },
    });
  }

  findByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.masterAdminAuditOutbox.findUnique({ where: { idempotencyKey } });
  }

  findById(id: string) {
    return this.prisma.masterAdminAuditOutbox.findUnique({ where: { id } });
  }

  findDueBatch(limit: number, now: Date = new Date()) {
    return this.prisma.masterAdminAuditOutbox.findMany({
      where: {
        status: MasterAdminAuditOutboxStatus.PENDING,
        nextRetryAt: { lte: now },
      },
      orderBy: { nextRetryAt: 'asc' },
      take: limit,
    });
  }

  async claimForProcessing(id: string) {
    const result = await this.prisma.masterAdminAuditOutbox.updateMany({
      where: {
        id,
        status: MasterAdminAuditOutboxStatus.PENDING,
        nextRetryAt: { lte: new Date() },
      },
      data: {
        status: MasterAdminAuditOutboxStatus.PROCESSING,
        attempts: { increment: 1 },
      },
    });
    if (result.count === 0) {
      return null;
    }
    return this.findById(id);
  }

  async markProcessed(id: string, tx?: Prisma.TransactionClient): Promise<boolean> {
    const client = tx ?? this.prisma;
    const result = await client.masterAdminAuditOutbox.updateMany({
      where: {
        id,
        status: {
          in: [
            MasterAdminAuditOutboxStatus.PENDING,
            MasterAdminAuditOutboxStatus.PROCESSING,
          ],
        },
      },
      data: {
        status: MasterAdminAuditOutboxStatus.PROCESSED,
        processedAt: new Date(),
        errorCode: null,
      },
    });
    return result.count > 0;
  }

  async markRetry(id: string, errorCode: string, nextRetryAt: Date): Promise<boolean> {
    const result = await this.prisma.masterAdminAuditOutbox.updateMany({
      where: {
        id,
        status: MasterAdminAuditOutboxStatus.PROCESSING,
      },
      data: {
        status: MasterAdminAuditOutboxStatus.PENDING,
        nextRetryAt,
        errorCode: errorCode.slice(0, 64),
        processedAt: null,
        deadLetteredAt: null,
      },
    });
    return result.count > 0;
  }

  async markDeadLetter(id: string, errorCode: string): Promise<boolean> {
    const result = await this.prisma.masterAdminAuditOutbox.updateMany({
      where: {
        id,
        status: {
          in: [
            MasterAdminAuditOutboxStatus.PENDING,
            MasterAdminAuditOutboxStatus.PROCESSING,
          ],
        },
      },
      data: {
        status: MasterAdminAuditOutboxStatus.DEAD_LETTER,
        deadLetteredAt: new Date(),
        errorCode: errorCode.slice(0, 64),
      },
    });
    return result.count > 0;
  }

  async recoverStaleProcessing(staleBefore: Date): Promise<string[]> {
    const stale = await this.prisma.masterAdminAuditOutbox.findMany({
      where: {
        status: MasterAdminAuditOutboxStatus.PROCESSING,
        updatedAt: { lt: staleBefore },
      },
      select: { id: true },
    });
    if (stale.length === 0) {
      return [];
    }
    const ids = stale.map((row) => row.id);
    await this.prisma.masterAdminAuditOutbox.updateMany({
      where: { id: { in: ids } },
      data: {
        status: MasterAdminAuditOutboxStatus.PENDING,
        nextRetryAt: new Date(),
      },
    });
    return ids;
  }
}