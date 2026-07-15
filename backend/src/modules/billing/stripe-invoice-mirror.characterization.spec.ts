import { InvoiceStatus } from '@prisma/client';
import Stripe from 'stripe';
import { StripeInvoiceMirrorService } from './stripe-invoice-mirror.service';

describe('StripeInvoiceMirrorService characterization', () => {
  const prisma = {
    billingSubscription: { findFirst: jest.fn() },
    organization: { findUnique: jest.fn() },
    billingInvoice: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };

  let service: StripeInvoiceMirrorService;

  const stripeInvoice = {
    id: 'in_mirror_1',
    customer: 'cus_org_a',
    subscription: 'sub_stripe_1',
    livemode: true,
    status: 'paid',
    number: 'ACME-2026-0042',
    subtotal: 4500,
    tax: 855,
    total: 5355,
    amount_due: 0,
    amount_paid: 5355,
    amount_remaining: 0,
    currency: 'eur',
    created: 1_700_000_000,
    due_date: null,
    period_start: 1_699_000_000,
    period_end: 1_701_000_000,
    hosted_invoice_url: 'https://invoice.stripe.com/i/test',
    invoice_pdf: 'https://pay.stripe.com/invoice/pdf/test',
    customer_name: 'Acme GmbH',
    customer_email: 'billing@acme.test',
    status_transitions: { paid_at: 1_700_000_100, finalized_at: 1_700_000_050, voided_at: null },
    total_discount_amounts: [],
    lines: {
      data: [
        {
          id: 'il_mirror_1',
          description: 'SynqDrive per vehicle',
          quantity: 3,
          amount: 4500,
          price: {
            id: 'price_1',
            unit_amount: 1500,
            currency: 'eur',
            product: { id: 'prod_1', name: 'SynqDrive Rental' },
          },
          tax_amounts: [{ amount: 855, inclusive: false, tax_rate: 'txr_1' }],
          tax_rates: [{ effective_percentage: 19 }],
          discount_amounts: [],
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
    prisma.organization.findUnique.mockResolvedValue({
      companyName: 'Acme GmbH',
      legalCompanyName: 'Acme GmbH legal',
      vatId: 'DE123456789',
      taxId: null,
      taxNumber: null,
      invoiceEmail: 'billing@acme.test',
      address: 'Street 1',
      city: 'Berlin',
      state: 'BE',
      zip: '10115',
      country: 'DE',
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
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'line-1' }),
          update: jest.fn(),
        },
      };
      return fn(tx as never);
    });

    const id = await service.mirrorStripeInvoice(stripeInvoice);

    expect(id).toBe('local-inv-1');
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('updates existing invoice header and line amounts without replacing snapshots', async () => {
    prisma.billingInvoice.findUnique.mockResolvedValue({
      id: 'local-inv-existing',
      customerSnapshotJson: { name: 'Frozen GmbH', email: 'frozen@acme.test', phone: null },
      companySnapshotJson: {
        companyName: 'Frozen GmbH',
        legalCompanyName: null,
        vatId: 'DE999',
        taxId: null,
        taxNumber: null,
        invoiceEmail: null,
      },
      billingAddressJson: null,
      taxIdSnapshot: 'DE999',
    });
    const txUpdate = jest.fn().mockResolvedValue({});
    const txFindLine = jest.fn().mockResolvedValue({
      id: 'line-existing',
      productSnapshotJson: { productId: 'frozen' },
      priceSnapshotJson: { priceId: 'frozen_price' },
    });
    const txUpdateLine = jest.fn().mockResolvedValue({});
    const txCreateLine = jest.fn().mockResolvedValue({ id: 'line-new' });
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        billingInvoice: { update: txUpdate },
        billingInvoiceLine: {
          findUnique: txFindLine,
          update: txUpdateLine,
          create: txCreateLine,
        },
      }),
    );

    const id = await service.mirrorStripeInvoice({
      ...stripeInvoice,
      status: 'open',
      total: 5000,
      amount_paid: 0,
      amount_remaining: 5000,
      status_transitions: { paid_at: null, finalized_at: 1_700_000_050, voided_at: null },
    } as Stripe.Invoice);

    expect(id).toBe('local-inv-existing');
    expect(txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'local-inv-existing' },
        data: expect.objectContaining({
          amountCents: 5000,
          status: InvoiceStatus.OPEN,
          paidAt: null,
          customerSnapshotJson: expect.objectContaining({ name: 'Frozen GmbH' }),
        }),
      }),
    );
    expect(txUpdateLine).toHaveBeenCalled();
    expect(txCreateLine).not.toHaveBeenCalled();
  });

  it('returns null when no local subscription mapping exists', async () => {
    prisma.billingSubscription.findFirst.mockResolvedValue(null);

    const id = await service.mirrorStripeInvoice(stripeInvoice);

    expect(id).toBeNull();
    expect(prisma.billingInvoice.findUnique).not.toHaveBeenCalled();
  });

  it('mirrors draft invoice without official number', async () => {
    prisma.billingInvoice.findUnique.mockResolvedValue(null);
    let capturedData: unknown;
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        billingInvoice: {
          create: jest.fn().mockImplementation(({ data }) => {
            capturedData = data;
            return { id: 'inv-draft' };
          }),
        },
        billingInvoiceLine: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
          update: jest.fn(),
        },
      }),
    );

    await service.mirrorStripeInvoice({
      ...stripeInvoice,
      status: 'draft',
      number: null,
      amount_paid: 0,
      amount_remaining: 5355,
      status_transitions: { paid_at: null, finalized_at: null, voided_at: null },
    } as Stripe.Invoice);

    expect(capturedData).toEqual(
      expect.objectContaining({
        invoiceNumber: null,
        status: InvoiceStatus.DRAFT,
        paidAt: null,
      }),
    );
  });
});
