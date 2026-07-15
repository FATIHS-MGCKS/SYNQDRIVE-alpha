import { Injectable } from '@nestjs/common';
import {
  BillingDomainEventOutboxDeliveryStatus,
  BillingDomainEventOutboxStatus,
  Prisma,
} from '@prisma/client';
import { sanitizeBillingAuditPayload } from './domain/billing-command';
import {
  BILLING_OUTBOX_DEFAULT_CONSUMER_ID,
  BILLING_OUTBOX_PAYLOAD_VERSION,
  buildVersionedBillingOutboxPayload,
  sanitizeBillingOutboxPayload,
} from './domain/billing-outbox';

export interface BillingDomainEventOutboxInput {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  occurredAt?: Date;
  organizationId?: string | null;
  consumerIds?: string[];
  payloadVersion?: number;
}

@Injectable()
export class BillingDomainEventOutboxService {
  async enqueue(
    tx: Prisma.TransactionClient,
    input: BillingDomainEventOutboxInput,
  ) {
    const existing = await tx.billingDomainEventOutbox.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { deliveries: true },
    });
    if (existing) {
      return existing;
    }

    const organizationId =
      input.organizationId ??
      (typeof input.payload.organizationId === 'string'
        ? input.payload.organizationId
        : null);

    const payload = buildVersionedBillingOutboxPayload(
      sanitizeBillingOutboxPayload(input.payload),
    );

    const event = await tx.billingDomainEventOutbox.create({
      data: {
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        organizationId,
        payloadVersion: input.payloadVersion ?? BILLING_OUTBOX_PAYLOAD_VERSION,
        payload: sanitizeBillingAuditPayload(payload) as Prisma.InputJsonValue,
        occurredAt: input.occurredAt ?? new Date(),
        idempotencyKey: input.idempotencyKey,
        status: BillingDomainEventOutboxStatus.PENDING,
      },
    });

    const consumerIds = input.consumerIds?.length
      ? input.consumerIds
      : [BILLING_OUTBOX_DEFAULT_CONSUMER_ID];

    for (const consumerId of consumerIds) {
      await tx.billingDomainEventOutboxDelivery.create({
        data: {
          outboxEventId: event.id,
          consumerId,
          status: BillingDomainEventOutboxDeliveryStatus.PENDING,
        },
      });
    }

    return tx.billingDomainEventOutbox.findUniqueOrThrow({
      where: { id: event.id },
      include: { deliveries: true },
    });
  }
}
