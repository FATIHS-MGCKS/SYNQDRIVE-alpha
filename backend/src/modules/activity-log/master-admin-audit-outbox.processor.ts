import { Injectable, Logger } from '@nestjs/common';
import { MasterAdminAuditOutboxStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { MASTER_ADMIN_AUDIT_OUTBOX } from './master-admin-audit-outbox.constants';
import { MasterAdminAuditOutboxRepository } from './master-admin-audit-outbox.repository';
import {
  classifyMasterAdminAuditDeliveryError,
  sanitizeMasterAdminAuditRecordInput,
} from './master-admin-audit-privacy.util';
import { persistMasterAdminAuditActivityLog } from './master-admin-audit-persistence.util';
import type { MasterAdminAuditRecordInput } from './master-admin-audit.contract';

@Injectable()
export class MasterAdminAuditOutboxProcessorService {
  private readonly logger = new Logger(MasterAdminAuditOutboxProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxRepo: MasterAdminAuditOutboxRepository,
  ) {}

  async processOutboxId(
    outboxId: string,
  ): Promise<'processed' | 'retry' | 'dead_letter' | 'skipped' | 'duplicate'> {
    const existing = await this.prisma.masterAdminAuditOutbox.findUnique({ where: { id: outboxId } });
    if (!existing) {
      return 'skipped';
    }
    if (existing.status === MasterAdminAuditOutboxStatus.PROCESSED) {
      return 'duplicate';
    }
    if (existing.status === MasterAdminAuditOutboxStatus.DEAD_LETTER) {
      return 'skipped';
    }

    const claimed = await this.outboxRepo.claimForProcessing(outboxId);
    if (!claimed) {
      return 'skipped';
    }

    try {
      const payload = claimed.payload as Record<string, unknown>;
      const raw = payload.masterAdminAuditEnvelope;
      if (!raw || typeof raw !== 'object') {
        throw new Error('AUDIT_ENVELOPE_MISSING');
      }
      const envelope = sanitizeMasterAdminAuditRecordInput(raw as MasterAdminAuditRecordInput);

      await this.deliverAtomic(envelope, claimed.idempotencyKey, claimed.occurredAt, claimed.id);
      return 'processed';
    } catch (err) {
      const errorCode = classifyMasterAdminAuditDeliveryError(err);
      if (errorCode === 'AUDIT_PAYLOAD_SENSITIVE_VALUE') {
        await this.outboxRepo.markDeadLetter(claimed.id, errorCode);
        this.logger.error(`master_admin_audit_outbox dead-letter id=${claimed.id} code=${errorCode}`);
        return 'dead_letter';
      }

      if (claimed.attempts >= MASTER_ADMIN_AUDIT_OUTBOX.maxAttempts) {
        await this.outboxRepo.markDeadLetter(claimed.id, errorCode);
        this.logger.error(`master_admin_audit_outbox dead-letter id=${claimed.id} code=${errorCode}`);
        return 'dead_letter';
      }

      const retryAt = new Date(
        Date.now() +
          MASTER_ADMIN_AUDIT_OUTBOX.backoffMs * Math.pow(2, Math.max(0, claimed.attempts - 1)),
      );
      await this.outboxRepo.markRetry(claimed.id, errorCode, retryAt);
      this.logger.warn(
        `master_admin_audit_outbox retry id=${claimed.id} attempts=${claimed.attempts} code=${errorCode}`,
      );
      return 'retry';
    }
  }

  async deliverAtomic(
    envelope: MasterAdminAuditRecordInput,
    idempotencyKey: string,
    occurredAt: Date,
    outboxId: string,
  ): Promise<'delivered' | 'duplicate'> {
    return this.prisma.$transaction(async (tx) => {
      const ledger = await tx.masterAdminAuditDeliveryLedger.findUnique({
        where: { idempotencyKey },
      });
      if (ledger) {
        await this.outboxRepo.markProcessed(outboxId, tx);
        return 'duplicate';
      }

      const activityLogId = await persistMasterAdminAuditActivityLog(tx, envelope, {
        idempotencyKey,
        occurredAt,
      });

      await tx.masterAdminAuditDeliveryLedger.create({
        data: {
          idempotencyKey,
          activityLogId,
          occurredAt,
        },
      });

      await this.outboxRepo.markProcessed(outboxId, tx);
      return 'delivered';
    });
  }

  async processDue(limit = MASTER_ADMIN_AUDIT_OUTBOX.pollBatchSize): Promise<void> {
    const staleBefore = new Date(Date.now() - MASTER_ADMIN_AUDIT_OUTBOX.staleProcessingMs);
    await this.outboxRepo.recoverStaleProcessing(staleBefore);

    const rows = await this.outboxRepo.findDueBatch(limit);
    for (const row of rows) {
      await this.processOutboxId(row.id);
    }
  }
}