import {
  BillingDomainEventOutboxDeliveryStatus,
  BillingDomainEventOutboxStatus,
} from '@prisma/client';
import { BillingDomainEventOutboxService } from './billing-domain-event-outbox.service';
import { BillingDomainEventOutboxRepository } from './billing-domain-event-outbox.repository';
import { BillingDomainEventOutboxProcessorService } from './billing-domain-event-outbox.processor.service';
import { BillingDomainEventType } from './domain/billing-domain.events';
import {
  BILLING_OUTBOX_EMAIL_CONSUMER_ID,
  BILLING_OUTBOX_MAX_RETRIES,
  BILLING_OUTBOX_PRIMARY_CONSUMER_ID,
} from './domain/billing-outbox';

describe('BillingDomainEventOutbox transactional flow', () => {
  let outboxRows: any[];
  let deliveryRows: any[];
  let txShouldFail: boolean;

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
                (clause.nextRetryAt == null && row.nextRetryAt == null) ||
                (clause.nextRetryAt?.lte && row.nextRetryAt && row.nextRetryAt <= clause.nextRetryAt.lte),
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
            row.outboxEventId === where.outboxEventId &&
            (!where.status?.not || row.status !== where.status.not),
        ).length,
      ),
    },
  };

  const prisma: any = {
    billingDomainEventOutbox: tx.billingDomainEventOutbox,
    billingDomainEventOutboxDelivery: tx.billingDomainEventOutboxDelivery,
    $transaction: jest.fn(async (fn: any) => {
      if (txShouldFail) throw new Error('tx_rollback');
      return fn(tx);
    }),
  };

  const publisher = { publish: jest.fn() };
  let outboxService: BillingDomainEventOutboxService;
  let repository: BillingDomainEventOutboxRepository;
  let processor: BillingDomainEventOutboxProcessorService;

  beforeEach(() => {
    jest.clearAllMocks();
    outboxRows = [];
    deliveryRows = [];
    txShouldFail = false;
    publisher.publish.mockResolvedValue(undefined);
    prisma.$transaction.mockImplementation(async (fn: any) => {
      if (txShouldFail) throw new Error('tx_rollback');
      return fn(tx);
    });
    outboxService = new BillingDomainEventOutboxService();
    repository = new BillingDomainEventOutboxRepository(prisma);
    processor = new BillingDomainEventOutboxProcessorService(repository, publisher as any);
  });

  it('writes outbox and delivery in the same transaction on success', async () => {
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

    expect(outboxRows).toHaveLength(1);
    expect(deliveryRows).toHaveLength(2);
    expect(outboxRows[0].payload).toMatchObject({
      payloadVersion: 1,
      paymentId: 'pay-1',
    });
  });

  it('rolls back outbox insert when transaction fails', async () => {
    txShouldFail = true;
    await expect(
      prisma.$transaction(async (client: typeof tx) =>
        outboxService.enqueue(client, {
          eventType: BillingDomainEventType.INVOICE_FINALIZED,
          aggregateType: 'BillingInvoice',
          aggregateId: 'inv-1',
          idempotencyKey: 'invoice:inv-1',
          payload: { invoiceId: 'inv-1' },
        }),
      ),
    ).rejects.toThrow('tx_rollback');
    expect(outboxRows).toHaveLength(0);
    expect(deliveryRows).toHaveLength(0);
  });

  it('deduplicates enqueue by idempotency key', async () => {
    await prisma.$transaction(async (client: typeof tx) =>
      outboxService.enqueue(client, {
        eventType: BillingDomainEventType.REFUND_CREATED,
        aggregateType: 'BillingRefund',
        aggregateId: 'ref-1',
        idempotencyKey: 'refund:ref-1',
        payload: { refundId: 'ref-1' },
      }),
    );
    await prisma.$transaction(async (client: typeof tx) =>
      outboxService.enqueue(client, {
        eventType: BillingDomainEventType.REFUND_CREATED,
        aggregateType: 'BillingRefund',
        aggregateId: 'ref-1',
        idempotencyKey: 'refund:ref-1',
        payload: { refundId: 'ref-1' },
      }),
    );

    expect(outboxRows).toHaveLength(1);
    expect(deliveryRows).toHaveLength(2);
  });

  it('delivers event once and marks published', async () => {
    await prisma.$transaction(async (client: typeof tx) =>
      outboxService.enqueue(client, {
        eventType: BillingDomainEventType.CREDIT_NOTE_CREATED,
        aggregateType: 'BillingCreditNote',
        aggregateId: 'cn-1',
        idempotencyKey: 'credit-note:cn-1',
        payload: { creditNoteId: 'cn-1', payloadVersion: 1 },
      }),
    );

    deliveryRows
      .filter((row) => row.consumerId === BILLING_OUTBOX_EMAIL_CONSUMER_ID)
      .forEach((row) => {
        row.status = BillingDomainEventOutboxDeliveryStatus.DELIVERED;
      });

    const claimed = await repository.claimPendingDeliveries(10, 'worker-a');
    const outcome = await processor.processClaimedDelivery(claimed[0]!);

    expect(outcome).toBe('delivered');
    expect(publisher.publish).toHaveBeenCalledTimes(1);
    expect(outboxRows[0].status).toBe(BillingDomainEventOutboxStatus.PUBLISHED);
    expect(
      deliveryRows.find((row) => row.consumerId === BILLING_OUTBOX_PRIMARY_CONSUMER_ID)!.status,
    ).toBe(BillingDomainEventOutboxDeliveryStatus.DELIVERED);
  });

  it('does not redeliver already published events', async () => {
    await prisma.$transaction(async (client: typeof tx) =>
      outboxService.enqueue(client, {
        eventType: BillingDomainEventType.SUBSCRIPTION_CHANGED,
        aggregateType: 'BillingSubscription',
        aggregateId: 'sub-1',
        idempotencyKey: 'sub:sub-1:changed',
        payload: { subscriptionId: 'sub-1' },
      }),
    );
    outboxRows[0].status = BillingDomainEventOutboxStatus.PUBLISHED;

    const claimed = await repository.claimPendingDeliveries(10, 'worker-b');
    expect(claimed).toHaveLength(0);
  });

  it('retries failed delivery and eventually dead-letters', async () => {
    publisher.publish.mockRejectedValue(new Error('consumer_down'));
    await prisma.$transaction(async (client: typeof tx) =>
      outboxService.enqueue(client, {
        eventType: BillingDomainEventType.PAYMENT_FAILED,
        aggregateType: 'BillingPayment',
        aggregateId: 'pay-fail-1',
        idempotencyKey: 'payment:pay-fail-1',
        payload: { paymentId: 'pay-fail-1' },
      }),
    );

    for (let attempt = 0; attempt < BILLING_OUTBOX_MAX_RETRIES; attempt += 1) {
      const primaryDelivery = deliveryRows.find(
        (row) => row.consumerId === BILLING_OUTBOX_PRIMARY_CONSUMER_ID,
      )!;
      primaryDelivery.status = BillingDomainEventOutboxDeliveryStatus.PENDING;
      primaryDelivery.nextRetryAt = new Date(0);
      deliveryRows
        .filter((row) => row.consumerId !== BILLING_OUTBOX_PRIMARY_CONSUMER_ID)
        .forEach((row) => {
          row.status = BillingDomainEventOutboxDeliveryStatus.DELIVERED;
        });
      outboxRows[0].status = BillingDomainEventOutboxStatus.FAILED;
      const claimed = await repository.claimPendingDeliveries(1, 'worker-retry');
      if (!claimed[0]) continue;
      await processor.processClaimedDelivery(claimed[0]);
    }

    const primaryDelivery = deliveryRows.find(
      (row) => row.consumerId === BILLING_OUTBOX_PRIMARY_CONSUMER_ID,
    )!;
    expect(primaryDelivery.status).toBe(BillingDomainEventOutboxDeliveryStatus.DEAD_LETTER);
    expect(outboxRows[0].status).toBe(BillingDomainEventOutboxStatus.DEAD_LETTER);
    expect(publisher.publish.mock.calls.length).toBe(BILLING_OUTBOX_MAX_RETRIES);
  });

  it('allows only one worker to claim the same delivery', async () => {
    await prisma.$transaction(async (client: typeof tx) =>
      outboxService.enqueue(client, {
        eventType: BillingDomainEventType.INVOICE_OVERDUE,
        aggregateType: 'BillingInvoice',
        aggregateId: 'inv-overdue',
        idempotencyKey: 'invoice:overdue:1',
        payload: { invoiceId: 'inv-overdue' },
      }),
    );

    const [workerA, workerB] = await Promise.all([
      repository.claimPendingDeliveries(1, 'worker-a'),
      repository.claimPendingDeliveries(1, 'worker-b'),
    ]);

    const totalClaimed = workerA.length + workerB.length;
    expect(totalClaimed).toBe(1);
  });
});
