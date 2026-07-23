import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { BusinessAuditOutboxStatus, Prisma } from '@prisma/client';
import {
  EnqueueBusinessAuditOutboxInput,
  BusinessAuditOutboxRepository,
} from './business-audit-outbox.repository';
import { BusinessAuditOutboxProcessorService } from './business-audit-outbox.processor';
import { BUSINESS_AUDIT_OUTBOX } from './business-audit.constants';

@Injectable()
export class BusinessAuditService {
  constructor(
    private readonly outboxRepo: BusinessAuditOutboxRepository,
    private readonly processor: BusinessAuditOutboxProcessorService,
  ) {}

  enqueueInTransaction(tx: Prisma.TransactionClient, input: EnqueueBusinessAuditOutboxInput) {
    return this.outboxRepo.enqueueInTransaction(tx, input);
  }

  enqueue(input: EnqueueBusinessAuditOutboxInput) {
    return this.outboxRepo.enqueue(input);
  }

  async processOutboxIds(outboxIds: Array<string | null | undefined>): Promise<void> {
    for (const outboxId of outboxIds) {
      if (!outboxId) continue;
      await this.processor.processOutboxId(outboxId);
    }
  }

  async flushCritical(outboxIds: Array<string | null | undefined>): Promise<void> {
    for (const outboxId of outboxIds) {
      if (!outboxId) continue;
      await this.flushCriticalOutboxId(outboxId);
    }
  }

  private async flushCriticalOutboxId(outboxId: string): Promise<void> {
    for (let attempt = 0; attempt < BUSINESS_AUDIT_OUTBOX.maxAttempts; attempt++) {
      const result = await this.processor.processOutboxId(outboxId);

      if (result === 'processed' || result === 'duplicate') {
        return;
      }

      if (result === 'dead_letter') {
        throw new ServiceUnavailableException({
          code: 'BUSINESS_AUDIT_OUTBOX_DEAD_LETTER',
          message: 'Critical business audit event could not be persisted.',
          outboxId,
        });
      }

      if (result === 'skipped') {
        const row = await this.outboxRepo.findById(outboxId);
        if (row?.status === BusinessAuditOutboxStatus.PROCESSED) {
          return;
        }
        if (row?.status === BusinessAuditOutboxStatus.DEAD_LETTER) {
          throw new ServiceUnavailableException({
            code: 'BUSINESS_AUDIT_OUTBOX_DEAD_LETTER',
            message: 'Critical business audit event could not be persisted.',
            outboxId,
          });
        }
      }

      if (result === 'retry' && attempt < BUSINESS_AUDIT_OUTBOX.maxAttempts - 1) {
        await this.sleep(
          BUSINESS_AUDIT_OUTBOX.backoffMs * Math.pow(2, Math.max(0, attempt)),
        );
      }
    }

    const row = await this.outboxRepo.findById(outboxId);
    if (row?.status === BusinessAuditOutboxStatus.PROCESSED) {
      return;
    }

    throw new ServiceUnavailableException({
      code: 'BUSINESS_AUDIT_OUTBOX_FLUSH_FAILED',
      message: 'Critical business audit event could not be flushed before the operation completed.',
      outboxId,
      status: row?.status ?? null,
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
