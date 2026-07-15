import {
  BillingCreditNoteStatus,
  BillingPaymentAttemptStatus,
  BillingPaymentProvider,
  BillingPaymentStatus,
  BillingRefundStatus,
  BillingStripeMode,
} from '@prisma/client';
import { BillingPaymentLedgerService } from './billing-payment-ledger.service';
import { BillingDomainEventType } from './domain/billing-domain.events';

describe('BillingPaymentLedgerService', () => {
  const orgId = 'org-ledger-1';
  const invoiceId = 'inv-ledger-1';

  let payments: any[];
  let attempts: any[];
  let refunds: any[];
  let creditNotes: any[];
  let outbox: any[];

  const prisma: any = {
    billingInvoice: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.id === invoiceId ? { id: invoiceId } : null,
      ),
    },
    billingPayment: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.id) return payments.find((row) => row.id === where.id) ?? null;
        if (where.idempotencyKey) {
          return payments.find((row) => row.idempotencyKey === where.idempotencyKey) ?? null;
        }
        if (where.stripePaymentIntentId_stripeMode) {
          const key = where.stripePaymentIntentId_stripeMode;
          return (
            payments.find(
              (row) =>
                row.stripePaymentIntentId === key.stripePaymentIntentId &&
                row.stripeMode === key.stripeMode,
            ) ?? null
          );
        }
        return null;
      }),
      findMany: jest.fn(async ({ where }: any) =>
        payments
          .filter((row) => row.invoiceId === where.invoiceId)
          .map((payment) => ({
            ...payment,
            attempts: attempts
              .filter((attempt) => attempt.paymentId === payment.id)
              .sort((a, b) => a.attemptNumber - b.attemptNumber),
            refunds: refunds
              .filter((refund) => refund.paymentId === payment.id)
              .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
          })),
      ),
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: `pay-${payments.length + 1}`,
          createdAt: new Date(),
          attemptCount: 0,
          refundedAmountCents: 0,
          ...data,
        };
        payments.push(row);
        return row;
      }),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const key = where.stripePaymentIntentId_stripeMode;
        const existing = payments.find(
          (row) =>
            row.stripePaymentIntentId === key.stripePaymentIntentId &&
            row.stripeMode === key.stripeMode,
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = {
          id: `pay-${payments.length + 1}`,
          createdAt: new Date(),
          attemptCount: 0,
          refundedAmountCents: 0,
          ...create,
        };
        payments.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = payments.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      }),
    },
    billingPaymentAttempt: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.idempotencyKey
          ? attempts.find((row) => row.idempotencyKey === where.idempotencyKey) ?? null
          : null,
      ),
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: `attempt-${attempts.length + 1}`,
          attemptedAt: new Date(),
          createdAt: new Date(),
          ...data,
        };
        attempts.push(row);
        return row;
      }),
    },
    billingRefund: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.idempotencyKey
          ? refunds.find((row) => row.idempotencyKey === where.idempotencyKey) ?? null
          : null,
      ),
      findMany: jest.fn(async ({ where }: any) =>
        refunds.filter((row) => row.paymentId === where.paymentId),
      ),
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: `refund-${refunds.length + 1}`,
          createdAt: new Date(),
          ...data,
        };
        refunds.push(row);
        return row;
      }),
    },
    billingCreditNote: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.idempotencyKey
          ? creditNotes.find((row) => row.idempotencyKey === where.idempotencyKey) ?? null
          : null,
      ),
      findMany: jest.fn(async ({ where }: any) =>
        creditNotes.filter((row) => row.invoiceId === where.invoiceId),
      ),
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: `cn-${creditNotes.length + 1}`,
          createdAt: new Date(),
          ...data,
        };
        creditNotes.push(row);
        return row;
      }),
    },
    billingDomainEventOutbox: {
      create: jest.fn(async ({ data }: any) => {
        outbox.push(data);
        return { id: `outbox-${outbox.length}`, ...data };
      }),
    },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };

  const outboxService = {
    enqueue: jest.fn(async (tx: any, input: any) => tx.billingDomainEventOutbox.create({ data: input })),
  };
  const audit = { log: jest.fn() };

  let service: BillingPaymentLedgerService;

  beforeEach(() => {
    jest.clearAllMocks();
    payments = [];
    attempts = [];
    refunds = [];
    creditNotes = [];
    outbox = [];
    service = new BillingPaymentLedgerService(prisma, outboxService as any, audit as any);
  });

  it('records successful payment with stripe references', async () => {
    const payment = await service.recordPayment({
      invoiceId,
      organizationId: orgId,
      amountCents: 5355,
      currency: 'eur',
      status: BillingPaymentStatus.SUCCEEDED,
      stripePaymentIntentId: 'pi_success_1',
      stripeChargeId: 'ch_success_1',
      stripePaymentMethodId: 'pm_card_1',
      stripeMode: BillingStripeMode.TEST,
      succeededAt: new Date('2026-07-15T10:00:00.000Z'),
      idempotencyKey: 'payment:success:1',
    });

    expect(payment.amountCents).toBe(5355);
    expect(payment.remainingAmountCents).toBe(5355);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].eventType).toBe(BillingDomainEventType.PAYMENT_SUCCEEDED);
  });

  it('appends multiple failed attempts without deleting prior rows', async () => {
    const payment = await service.recordPayment({
      invoiceId,
      organizationId: orgId,
      amountCents: 2000,
      currency: 'eur',
      status: BillingPaymentStatus.PENDING,
      stripePaymentIntentId: 'pi_fail_1',
      stripeMode: BillingStripeMode.TEST,
      idempotencyKey: 'payment:fail:1',
    });

    const first = await service.appendPaymentAttempt({
      paymentId: payment.id,
      organizationId: orgId,
      amountCents: 2000,
      status: BillingPaymentAttemptStatus.FAILED,
      stripeChargeId: 'ch_fail_1',
      stripeMode: BillingStripeMode.TEST,
      errorCode: 'card_declined',
      declineCode: 'insufficient_funds',
      errorMessage: 'Card 4242 4242 4242 4242 was declined',
      nextRetryAt: new Date('2026-07-16T10:00:00.000Z'),
      idempotencyKey: 'attempt:fail:1',
    });

    const second = await service.appendPaymentAttempt({
      paymentId: payment.id,
      organizationId: orgId,
      amountCents: 2000,
      status: BillingPaymentAttemptStatus.FAILED,
      stripeChargeId: 'ch_fail_2',
      stripeMode: BillingStripeMode.TEST,
      errorCode: 'card_declined',
      declineCode: 'generic_decline',
      errorMessage: 'Your card was declined',
      idempotencyKey: 'attempt:fail:2',
    });

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(false);
    expect(attempts).toHaveLength(2);
    expect(attempts[0].safeErrorMessage).toContain('[redacted]');
    expect(payments[0].attemptCount).toBe(2);
  });

  it('records partial refund and reconciles remaining amount', async () => {
    const payment = await service.recordPayment({
      invoiceId,
      organizationId: orgId,
      amountCents: 1000,
      currency: 'eur',
      status: BillingPaymentStatus.SUCCEEDED,
      idempotencyKey: 'payment:partial:1',
    });

    const partial = await service.recordRefund({
      paymentId: payment.id,
      organizationId: orgId,
      amountCents: 400,
      currency: 'eur',
      status: BillingRefundStatus.SUCCEEDED,
      reason: 'requested_by_customer',
      stripeRefundId: 're_partial_1',
      stripeMode: BillingStripeMode.TEST,
      idempotencyKey: 'refund:partial:1',
    });

    const reconciled = await prisma.billingPayment.findUnique({ where: { id: payment.id } });

    expect(partial.refund.isPartial).toBe(true);
    expect(reconciled.status).toBe(BillingPaymentStatus.PARTIALLY_REFUNDED);
    expect(reconciled.refundedAmountCents).toBe(400);
    expect(reconciled.remainingAmountCents).toBe(600);
  });

  it('records full refund across two succeeded refunds', async () => {
    const payment = await service.recordPayment({
      invoiceId,
      organizationId: orgId,
      amountCents: 1000,
      currency: 'eur',
      status: BillingPaymentStatus.SUCCEEDED,
      idempotencyKey: 'payment:full:1',
    });

    await service.recordRefund({
      paymentId: payment.id,
      organizationId: orgId,
      amountCents: 400,
      currency: 'eur',
      status: BillingRefundStatus.SUCCEEDED,
      idempotencyKey: 'refund:full:1',
    });
    await service.recordRefund({
      paymentId: payment.id,
      organizationId: orgId,
      amountCents: 600,
      currency: 'eur',
      status: BillingRefundStatus.SUCCEEDED,
      idempotencyKey: 'refund:full:2',
    });

    const reconciled = await prisma.billingPayment.findUnique({ where: { id: payment.id } });
    expect(reconciled.status).toBe(BillingPaymentStatus.REFUNDED);
    expect(reconciled.remainingAmountCents).toBe(0);
    expect(refunds[1].isPartial).toBe(false);
  });

  it('records credit note and returns safe invoice ledger view', async () => {
    const payment = await service.recordPayment({
      invoiceId,
      organizationId: orgId,
      amountCents: 1000,
      currency: 'eur',
      status: BillingPaymentStatus.SUCCEEDED,
      idempotencyKey: 'payment:cn:1',
    });

    const refund = await service.recordRefund({
      paymentId: payment.id,
      organizationId: orgId,
      amountCents: 1000,
      currency: 'eur',
      status: BillingRefundStatus.SUCCEEDED,
      idempotencyKey: 'refund:cn:1',
    });

    await service.recordCreditNote({
      invoiceId,
      organizationId: orgId,
      refundId: refund.refund.id,
      amountCents: 1000,
      currency: 'eur',
      status: BillingCreditNoteStatus.ISSUED,
      reason: 'duplicate',
      stripeCreditNoteId: 'cn_stripe_1',
      stripeMode: BillingStripeMode.TEST,
      hostedUrl: 'https://invoice.stripe.com/cn/test',
      pdfUrl: 'https://pay.stripe.com/credit_note/pdf/test',
      issuedAt: new Date('2026-07-15T12:00:00.000Z'),
      idempotencyKey: 'credit-note:1',
    });

    const ledger = await service.getInvoicePaymentLedger(invoiceId);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].creditNotes[0]).toMatchObject({
      amountCents: 1000,
      status: BillingCreditNoteStatus.ISSUED,
      hostedUrl: 'https://invoice.stripe.com/cn/test',
    });
    expect(ledger[0].refunds[0].isPartial).toBe(false);
  });

  it('returns duplicate refund without double booking', async () => {
    const payment = await service.recordPayment({
      invoiceId,
      organizationId: orgId,
      amountCents: 500,
      currency: 'eur',
      status: BillingPaymentStatus.SUCCEEDED,
      idempotencyKey: 'payment:dup:1',
    });

    const first = await service.recordRefund({
      paymentId: payment.id,
      organizationId: orgId,
      amountCents: 500,
      currency: 'eur',
      status: BillingRefundStatus.SUCCEEDED,
      idempotencyKey: 'refund:dup:1',
    });
    const second = await service.recordRefund({
      paymentId: payment.id,
      organizationId: orgId,
      amountCents: 500,
      currency: 'eur',
      status: BillingRefundStatus.SUCCEEDED,
      idempotencyKey: 'refund:dup:1',
    });

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(refunds).toHaveLength(1);
  });

  it('records manual payment via provider flag', async () => {
    const payment = await service.recordPayment({
      invoiceId,
      organizationId: orgId,
      amountCents: 2500,
      currency: 'eur',
      status: BillingPaymentStatus.SUCCEEDED,
      provider: BillingPaymentProvider.MANUAL,
      manualPaymentType: 'BANK_TRANSFER',
      manualReference: 'REF-2026-001',
      manualReceiptNote: 'Wire received',
      recordedByUserId: 'master-1',
      succeededAt: new Date(),
      idempotencyKey: 'manual:1',
    });

    expect(payment.provider).toBe(BillingPaymentProvider.MANUAL);
    expect(outbox[0].eventType).toBe(BillingDomainEventType.MANUAL_PAYMENT_RECORDED);
  });
});
