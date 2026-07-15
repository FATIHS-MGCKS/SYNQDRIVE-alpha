import { Injectable } from '@nestjs/common';
import { BillingDomainEventOutboxStatus, Prisma } from '@prisma/client';
import { sanitizeBillingAuditPayload } from './domain/billing-command';

export interface BillingDomainEventOutboxInput {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  occurredAt?: Date;
}

@Injectable()
export class BillingDomainEventOutboxService {
  async enqueue(
    tx: Prisma.TransactionClient,
    input: BillingDomainEventOutboxInput,
  ) {
    return tx.billingDomainEventOutbox.create({
      data: {
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        payload: sanitizeBillingAuditPayload(input.payload) as Prisma.InputJsonValue,
        occurredAt: input.occurredAt ?? new Date(),
        idempotencyKey: input.idempotencyKey,
        status: BillingDomainEventOutboxStatus.PENDING,
      },
    });
  }
}
