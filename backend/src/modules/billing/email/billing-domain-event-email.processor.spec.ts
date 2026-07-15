import {
  BillingDomainEventOutboxDeliveryStatus,
  BillingDomainEventOutboxStatus,
  OutboundEmailSourceType,
  OutboundEmailStatus,
} from '@prisma/client';
import { BillingDomainEventOutboxService } from '../billing-domain-event-outbox.service';
import { BillingDomainEventOutboxRepository } from '../billing-domain-event-outbox.repository';
import { BillingDomainEventEmailProcessorService } from './billing-domain-event-email.processor.service';
import { BillingEmailSenderService } from './billing-email-sender.service';
import { BillingDomainEventType } from '../domain/billing-domain.events';
import {
  BILLING_OUTBOX_EMAIL_CONSUMER_ID,
  BILLING_OUTBOX_MAX_RETRIES,
  BILLING_OUTBOX_PRIMARY_CONSUMER_ID,
} from '../domain/billing-outbox';

describe('BillingDomainEventEmailProcessor', () => {
  let outboxRows: any[];
  let deliveryRows: any[];
  let outboundRows: any[];

  const tx: any = {
    billingDomainEventOutbox: {
      findUnique: jest.fn(async ({ where, include }: any) => {
        const row = outboxRows.find((item) => {
          if (where.id) return item.id === where.id;
          if (where.idempotencyKey) return item.idempotencyKey === where.idempotencyKey;
          return false;
        });
        if (!row) return null;
        if (include?.deliveries) {
          return {
            ...row,
            deliveries: deliveryRows.filter((d) => d.outboxEventId === row.id),
          };
        }
        return row;
      }),
      findUniqueOrThrow: jest.fn(async ({ where, include }: any) => {
        const row = await tx.billingDomainEventOutbox.findUnique({ where, include });
        if (!row) throw new Error('missing outbox');
        return row;
      }),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `outbox-${outboxRows.length + 1}`, retryCount: 0, ...data };
        outboxRows.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = outboxRows.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      }),
    },
    billingDomainEventOutboxDelivery: {
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: `delivery-${deliveryRows.length + 1}`,
          retryCount: 0,
          ...data,
        };
        deliveryRows.push(row);
        return row;
      }),
      findMany: jest.fn(async ({ where, take, include }: any) => {
        const now = new Date();
        let rows = deliveryRows.filter((row) => {
          if (where.consumerId && row.consumerId !== where.consumerId) return false;
          if (where.status && row.status !== where.status) return false;
          if (where.OR) {
            const retryOk = where.OR.some(
              (clause: any) =>
                (clause.nextRetryAt == null && row.nextRetryAt == null)
                || (clause.nextRetryAt?.lte
                  && row.nextRetryAt
                  && row.nextRetryAt <= clause.nextRetryAt.lte),
            );
            if (!retryOk) return false;
          }
          if (where.outboxEvent?.status?.in) {
            const outbox = outboxRows.find((item) => item.id === row.outboxEventId);
            if (!outbox || !where.outboxEvent.status.in.includes(outbox.status)) return false;
          }
          return true;
        });
        rows = rows.slice(0, take ?? rows.length);
        if (include?.outboxEvent) {
          rows = rows.map((row) => ({
            ...row,
            outboxEvent: outboxRows.find((item) => item.id === row.outboxEventId),
          }));
        }
        return rows;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const matches = deliveryRows.filter(
          (row) => row.id === where.id && (!where.status || row.status === where.status),
        );
        for (const row of matches) Object.assign(row, data);
        return { count: matches.length };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = deliveryRows.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: any) =>
        deliveryRows.find((row) => row.id === where.id) ?? null,
      ),
      count: jest.fn(async ({ where }: any) =>
        deliveryRows.filter(
          (row) =>
            row.outboxEventId === where.outboxEventId
            && (!where.status?.not || row.status !== where.status.not),
        ).length,
      ),
    },
    outboundEmail: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `outbound-${outboundRows.length + 1}`, ...data };
        outboundRows.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = outboundRows.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      }),
      findMany: jest.fn(async () => []),
    },
  };

  const prisma: any = {
    billingDomainEventOutbox: tx.billingDomainEventOutbox,
    billingDomainEventOutboxDelivery: tx.billingDomainEventOutboxDelivery,
    outboundEmail: tx.outboundEmail,
    organization: {
      findUnique: jest.fn(async () => ({
        companyName: 'Test GmbH',
        legalCompanyName: null,
        language: 'de',
        invoiceEmail: 'billing@test.com',
        email: null,
        managerEmail: null,
      })),
    },
    billingSubscription: {
      findFirst: jest.fn(async () => ({
        currency: 'EUR',
        trialEndAt: null,
        currentPeriodEnd: new Date('2026-08-01'),
        priceBook: { name: 'Starter', productKey: 'RENTAL' },
      })),
    },
    billingInvoice: { findFirst: jest.fn(async () => null) },
    billingPayment: { findFirst: jest.fn(async () => null) },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };

  const sender = {
    sendFromOutboxDelivery: jest.fn(),
  };

  let outboxService: BillingDomainEventOutboxService;
  let repository: BillingDomainEventOutboxRepository;
  let processor: BillingDomainEventEmailProcessorService;

  beforeEach(() => {
    jest.clearAllMocks();
    outboxRows = [];
    deliveryRows = [];
    outboundRows = [];
    sender.sendFromOutboxDelivery.mockResolvedValue({
      success: true,
      outboundEmailId: 'outbound-1',
      retryable: false,
    });
    prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));
    outboxService = new BillingDomainEventOutboxService();
    repository = new BillingDomainEventOutboxRepository(prisma);
    processor = new BillingDomainEventEmailProcessorService(repository, sender as any);
  });

  it('creates primary and email deliveries on enqueue', async () => {
    await prisma.$transaction(async (client: typeof tx) =>
      outboxService.enqueue(client, {
        eventType: BillingDomainEventType.PAYMENT_SUCCEEDED,
        aggregateType: 'BillingPayment',
        aggregateId: 'pay-1',
        organizationId: 'org-1',
        idempotencyKey: 'payment:pay-1:event',
        payload: { organizationId: 'org-1', paymentId: 'pay-1', amountCents: 1000 },
      }),
    );

    expect(deliveryRows).toHaveLength(2);
    expect(deliveryRows.map((row) => row.consumerId)).toEqual([
      BILLING_OUTBOX_PRIMARY_CONSUMER_ID,
      BILLING_OUTBOX_EMAIL_CONSUMER_ID,
    ]);
  });

  it('delivers billing email via outbox consumer only', async () => {
    await prisma.$transaction(async (client: typeof tx) =>
      outboxService.enqueue(client, {
        eventType: BillingDomainEventType.INVOICE_FINALIZED,
        aggregateType: 'BillingInvoice',
        aggregateId: 'inv-1',
        organizationId: 'org-1',
        idempotencyKey: 'invoice:inv-1',
        payload: { organizationId: 'org-1', invoiceId: 'inv-1' },
      }),
    );

    const emailDelivery = deliveryRows.find(
      (row) => row.consumerId === BILLING_OUTBOX_EMAIL_CONSUMER_ID,
    );
    emailDelivery.status = BillingDomainEventOutboxDeliveryStatus.PENDING;
    const claimed = await repository.claimPendingDeliveries(
      1,
      'email-worker',
      BILLING_OUTBOX_EMAIL_CONSUMER_ID,
    );
    const outcome = await processor.processClaimedDelivery(claimed[0]!);

    expect(outcome).toBe('delivered');
    expect(sender.sendFromOutboxDelivery).toHaveBeenCalledTimes(1);
    expect(emailDelivery.status).toBe(BillingDomainEventOutboxDeliveryStatus.DELIVERED);
  });

  it('skips non-email event types without sending', async () => {
    await prisma.$transaction(async (client: typeof tx) =>
      outboxService.enqueue(client, {
        eventType: BillingDomainEventType.SUBSCRIPTION_CREATED,
        aggregateType: 'BillingSubscription',
        aggregateId: 'sub-1',
        organizationId: 'org-1',
        idempotencyKey: 'sub:created:1',
        payload: { organizationId: 'org-1' },
      }),
    );

    const emailDelivery = deliveryRows.find(
      (row) => row.consumerId === BILLING_OUTBOX_EMAIL_CONSUMER_ID,
    );
    const claimed = await repository.claimPendingDeliveries(
      1,
      'email-worker',
      BILLING_OUTBOX_EMAIL_CONSUMER_ID,
    );
    const outcome = await processor.processClaimedDelivery(claimed[0]!);
    expect(outcome).toBe('skipped');
    expect(sender.sendFromOutboxDelivery).not.toHaveBeenCalled();
    expect(emailDelivery.status).toBe(BillingDomainEventOutboxDeliveryStatus.DELIVERED);
  });

  it('retries on resend failure without rolling back billing outbox primary state', async () => {
    sender.sendFromOutboxDelivery.mockResolvedValue({
      success: false,
      retryable: true,
      errorMessage: 'provider_down',
    });

    await prisma.$transaction(async (client: typeof tx) =>
      outboxService.enqueue(client, {
        eventType: BillingDomainEventType.PAYMENT_FAILED,
        aggregateType: 'BillingPayment',
        aggregateId: 'pay-fail',
        organizationId: 'org-1',
        idempotencyKey: 'payment:fail:1',
        payload: { organizationId: 'org-1', paymentId: 'pay-fail' },
      }),
    );

    const primaryDelivery = deliveryRows.find(
      (row) => row.consumerId === BILLING_OUTBOX_PRIMARY_CONSUMER_ID,
    );
    const emailDelivery = deliveryRows.find(
      (row) => row.consumerId === BILLING_OUTBOX_EMAIL_CONSUMER_ID,
    );

    for (let attempt = 0; attempt < BILLING_OUTBOX_MAX_RETRIES; attempt += 1) {
      emailDelivery.status = BillingDomainEventOutboxDeliveryStatus.PENDING;
      emailDelivery.nextRetryAt = new Date(0);
      outboxRows[0].status = BillingDomainEventOutboxStatus.FAILED;
      const claimed = await repository.claimPendingDeliveries(
        1,
        'email-worker',
        BILLING_OUTBOX_EMAIL_CONSUMER_ID,
      );
      if (!claimed[0]) continue;
      await processor.processClaimedDelivery(claimed[0]);
    }

    expect(emailDelivery.status).toBe(BillingDomainEventOutboxDeliveryStatus.DEAD_LETTER);
    expect(primaryDelivery.status).toBe(BillingDomainEventOutboxDeliveryStatus.PENDING);
    expect(sender.sendFromOutboxDelivery).toHaveBeenCalledTimes(BILLING_OUTBOX_MAX_RETRIES);
  });

  it('treats sender skip as delivered for idempotent duplicate protection', async () => {
    sender.sendFromOutboxDelivery.mockResolvedValue({
      success: true,
      skipped: true,
      skipReason: 'already_sent',
      retryable: false,
    });

    await prisma.$transaction(async (client: typeof tx) =>
      outboxService.enqueue(client, {
        eventType: BillingDomainEventType.REFUND_CREATED,
        aggregateType: 'BillingRefund',
        aggregateId: 'ref-1',
        organizationId: 'org-1',
        idempotencyKey: 'refund:ref-1',
        payload: { organizationId: 'org-1', refundId: 'ref-1' },
      }),
    );

    const claimed = await repository.claimPendingDeliveries(
      1,
      'email-worker',
      BILLING_OUTBOX_EMAIL_CONSUMER_ID,
    );
    const outcome = await processor.processClaimedDelivery(claimed[0]!);
    expect(outcome).toBe('skipped');
    expect(deliveryRows.find((row) => row.consumerId === BILLING_OUTBOX_EMAIL_CONSUMER_ID)!.status)
      .toBe(BillingDomainEventOutboxDeliveryStatus.DELIVERED);
  });
});

describe('BillingEmailSenderService idempotency', () => {
  it('builds stable resend idempotency keys per outbox event', async () => {
    const { buildBillingEmailIdempotencyKey } = await import('../domain/billing-outbox');
    expect(buildBillingEmailIdempotencyKey('payment:pi_1:event')).toBe(
      'billing-email:payment:pi_1:event',
    );
  });
});
