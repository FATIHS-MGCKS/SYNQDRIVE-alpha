import { InvoiceStatus } from '@prisma/client';
import Stripe from 'stripe';
import { StripeInvoiceMirrorService } from './stripe-invoice-mirror.service';

describe('StripeInvoiceMirrorService characterization', () => {
  const prisma = {
    billingSubscription: { findFirst: jest.fn() },
    billingInvoice: { findUnique: jest.fn() },
    billingInvoiceLine: { deleteMany: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn(),
  };

  let service: StripeInvoiceMirrorService;

  const stripeInvoice = {
    id: 'in_mirror_1',
    customer: 'cus_org_a',
    subscription: 'sub_stripe_1',
    livemode: true,
    status: 'paid',
    total: 4500,
    currency: 'eur',
    created: 1_700_000_000,
    due_date: null,
    period_start: 1_699_000_000,
    period_end: 1_701_000_000,
    invoice_pdf: 'https://pay.stripe.com/invoice/pdf/test',
    status_transitions: { paid_at: 1_700_000_100 },
    lines: {
      data: [
        {
          id: 'il_mirror_1',
          description: 'SynqDrive per vehicle',
          quantity: 3,
          amount: 4500,
          price: { unit_amount: 1500 },
          plan: { nickname: 'Fleet tier' },
        },
      ],
    },
  } as unknown as Stripe.Invoice;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StripeInvoiceMirrorService(prisma as never);
    prisma.billingSubscription.findFirst.mockResolvedValue({
      id: 'local-sub-1',
      organizationId: 'org-a',
      stripeSubscriptionId: 'sub_stripe_1',
    });
  });

  it('findSubscriptionForStripeInvoice prefers stripeSubscriptionId mapping', async () => {
    await service.findSubscriptionForStripeInvoice(stripeInvoice);

    expect(prisma.billingSubscription.findFirst).toHaveBeenCalledWith({
      where: { stripeSubscriptionId: 'sub_stripe_1' },
    });
  });

  it('creates local BillingInvoice and lines on first mirror', async () => {
    prisma.billingInvoice.findUnique.mockResolvedValue(null);
    const createdRow = { id: 'local-inv-1' };
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const tx = {
        billingInvoice: {
          create: jest.fn().mockResolvedValue(createdRow),
        },
        billingInvoiceLine: {
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return fn(tx as never);
    });

    const id = await service.mirrorStripeInvoice(stripeInvoice);

    expect(id).toBe('local-inv-1');
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('updates existing invoice header without replacing mirrored line items', async () => {
    prisma.billingInvoice.findUnique.mockResolvedValue({ id: 'local-inv-existing' });
    const txUpdate = jest.fn().mockResolvedValue({});
    const txFindLine = jest.fn().mockResolvedValue({ id: 'line-existing' });
    const txCreateLine = jest.fn().mockResolvedValue({ id: 'line-new' });
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        billingInvoice: { update: txUpdate },
        billingInvoiceLine: {
          findUnique: txFindLine,
          create: txCreateLine,
        },
      }),
    );

    const id = await service.mirrorStripeInvoice({
      ...stripeInvoice,
      status: 'open',
      total: 5000,
    } as Stripe.Invoice);

    expect(id).toBe('local-inv-existing');
    expect(prisma.billingInvoice.findUnique).toHaveBeenCalledWith({
      where: {
        stripeInvoiceId_stripeMode: {
          stripeInvoiceId: 'in_mirror_1',
          stripeMode: 'LIVE',
        },
      },
      select: { id: true },
    });
    expect(txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'local-inv-existing' },
        data: expect.objectContaining({
          amountCents: 5000,
          status: InvoiceStatus.OPEN,
          stripeMode: 'LIVE',
        }),
      }),
    );
    expect(txFindLine).toHaveBeenCalled();
    expect(txCreateLine).not.toHaveBeenCalled();
  });

  it('returns null when no local subscription mapping exists', async () => {
    prisma.billingSubscription.findFirst.mockResolvedValue(null);

    const id = await service.mirrorStripeInvoice(stripeInvoice);

    expect(id).toBeNull();
    expect(prisma.billingInvoice.findUnique).not.toHaveBeenCalled();
  });

  it('legacy behavior – mirrored lines never link usageSnapshotId (to be corrected in prompt 25)', async () => {
    prisma.billingInvoice.findUnique.mockResolvedValue(null);
    let capturedLineData: unknown;
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        billingInvoice: { create: jest.fn().mockResolvedValue({ id: 'inv-x' }) },
        billingInvoiceLine: {
          createMany: jest.fn().mockImplementation(({ data }) => {
            capturedLineData = data;
            return { count: 1 };
          }),
        },
      }),
    );

    await service.mirrorStripeInvoice(stripeInvoice);

    expect(capturedLineData).toEqual([
      expect.not.objectContaining({ usageSnapshotId: expect.anything() }),
    ]);
  });
});
