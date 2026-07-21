import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  EnqueueIamAuditOutboxInput,
  IamAuditOutboxRepository,
} from './iam-audit-outbox.repository';
import { IamAuditOutboxProcessorService } from './iam-audit-outbox.processor';

@Injectable()
export class IamAuditService {
  constructor(
    private readonly outboxRepo: IamAuditOutboxRepository,
    private readonly processor: IamAuditOutboxProcessorService,
  ) {}

  enqueueInTransaction(tx: Prisma.TransactionClient, input: EnqueueIamAuditOutboxInput) {
    return this.outboxRepo.enqueueInTransaction(tx, input);
  }

  async processOutboxIds(outboxIds: string[]): Promise<void> {
    for (const outboxId of outboxIds) {
      await this.processor.processOutboxId(outboxId);
    }
  }
}
