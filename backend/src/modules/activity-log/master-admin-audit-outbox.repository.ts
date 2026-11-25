import { randomUUID } from 'node:crypto';
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

  /**
   * INSERT … ON CONFLICT DO NOTHING — safe under concurrent enqueue (no post-P2002 reads).
   */
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

    const id = randomUUID();
    const eventId = randomUUID();
    const subjectUserId =
      typeof envelope.metadata?.targetUserId === 'string' ? envelope.metadata.targetUserId : null;
    const organizationContextId = input.organizationContextId?.trim() || null;
    const payloadJson = JSON.stringify({ masterAdminAuditEnvelope: envelope });
    const nextRetryAt = new Date();

    const inserted = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO master_admin_audit_outbox (
        id,
        event_id,
        idempotency_key,
        audit_scope,
        organization_context_id,
        actor_user_id,
        subject_user_id,
        audit_action,
        occurred_at,
        payload_version,
        payload,
        processing_status,
        attempts,
        next_retry_at,
        created_at,
        updated_at
      )
      VALUES (
        ${id},
        ${eventId},
        ${input.idempotencyKey},
        ${input.auditScope}::"MasterAdminAuditScope",
        ${organizationContextId},
        ${envelope.actorUserId ?? null},
        ${subjectUserId},
        ${envelope.auditAction},
        ${input.occurredAt},
        ${MASTER_ADMIN_AUDIT_OUTBOX.payloadVersion},
        ${payloadJson}::jsonb,
        ${MasterAdminAuditOutboxStatus.PENDING}::"MasterAdminAuditOutboxStatus",
        0,
        ${nextRetryAt},
        NOW(),
        NOW()
      )
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id
    `;

    if (inserted.length > 0) {
      return tx.masterAdminAuditOutbox.findUniqueOrThrow({ where: { id: inserted[0]!.id } });
    }

    const conflictRow = await tx.masterAdminAuditOutbox.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (!conflictRow) {
      throw new Error('master_admin_audit_outbox_enqueue_conflict_missing_row');
    }
    return conflictRow;
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

  async recoverStaleProcessing(staleBefore: Date): Promise<number> {
    const result = await this.prisma.masterAdminAuditOutbox.updateMany({
      where: {
        status: MasterAdminAuditOutboxStatus.PROCESSING,
        updatedAt: { lt: staleBefore },
      },
      data: {
        status: MasterAdminAuditOutboxStatus.PENDING,
        nextRetryAt: new Date(),
      },
    });
    return result.count;
  }
}