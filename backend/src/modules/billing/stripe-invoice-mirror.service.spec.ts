import { InvoiceStatus } from '@prisma/client';
import Stripe from 'stripe';
import { StripeInvoiceMirrorService } from './stripe-invoice-mirror.service';

describe('StripeInvoiceMirrorService', () => {
  const organization = {
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
  };

  const subscription = {
    id: 'local-sub-1',
    organizationId: 'org-a',
    stripeSubscriptionId: 'sub_stripe_1',
    stripeMode: 'TEST' as const,
  };

  let prisma: any;
  let service: StripeInvoiceMirrorService;
  let tx: any;

  const baseInvoice = {
    id: 'in_mirror_1',
    customer: 'cus_org_a',
    subscription: 'sub_stripe_1',
    livemode: false,
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
    tx = {
      billingInvoice: {
        create: jest.fn(),
        update: jest.fn(),
      },
      billingInvoiceLine: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    prisma = {
      billingSubscription: { findFirst: jest.fn() },
      organization: { findUnique: jest.fn() },
      billingInvoice: { findUnique: jest.fn() },
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };

    service = new StripeInvoiceMirrorService(prisma);
    prisma.billingSubscription.findFirst.mockResolvedValue(subscription);
    prisma.organization.findUnique.mockResolvedValue(organization);
  });

  it('creates full invoice mirror on first webhook', async () => {
    prisma.billingInvoice.findUnique.mockResolvedValue(null);
    tx.billingInvoice.create.mockResolvedValue({ id: 'local-inv-1' });

    const id = await service.mirrorStripeInvoice(baseInvoice);

    expect(id).toBe('local-inv-1');
    expect(tx.billingInvoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        subscriptionId: 'local-sub-1',
        stripeInvoiceId: 'in_mirror_1',
        invoiceNumber: 'ACME-2026-0042',
        status: InvoiceStatus.PAID,
        netAmountCents: 4500,
        taxAmountCents: 855,
        amountCents: 5355,
        hostedInvoiceUrl: 'https://invoice.stripe.com/i/test',
        customerSnapshotJson: expect.objectContaining({ email: 'billing@acme.test' }),
        companySnapshotJson: expect.objectContaining({ companyName: 'Acme GmbH' }),
      }),
    });
    expect(tx.billingInvoiceLine.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stripeInvoiceLineId: 'il_mirror_1',
        taxCents: 855,
        productSnapshotJson: expect.objectContaining({ productId: 'prod_1' }),
      }),
    });
  });

  it('updates existing invoice on repeated webhook without replacing snapshots', async () => {
    prisma.billingInvoice.findUnique.mockResolvedValue({
      id: 'local-inv-existing',
      customerSnapshotJson: { name: 'Frozen GmbH', email: 'frozen@acme.test', phone: null },
      companySnapshotJson: { companyName: 'Frozen GmbH', legalCompanyName: null, vatId: 'DE999', taxId: null, taxNumber: null, invoiceEmail: null },
      billingAddressJson: null,
      taxIdSnapshot: 'DE999',
    });
    tx.billingInvoiceLine.findUnique.mockResolvedValue({
      id: 'line-existing',
      productSnapshotJson: { productId: 'frozen' },
      priceSnapshotJson: { priceId: 'frozen_price' },
    });

    const id = await service.mirrorStripeInvoice({
      ...baseInvoice,
      total: 6000,
      amount_paid: 6000,
      customer_name: 'Changed Name',
    } as Stripe.Invoice);

    expect(id).toBe('local-inv-existing');
    expect(tx.billingInvoice.update).toHaveBeenCalledWith({
      where: { id: 'local-inv-existing' },
      data: expect.objectContaining({
        amountCents: 6000,
        customerSnapshotJson: expect.objectContaining({ name: 'Frozen GmbH' }),
        companySnapshotJson: expect.objectContaining({ companyName: 'Frozen GmbH' }),
        taxIdSnapshot: 'DE999',
      }),
    });
    expect(tx.billingInvoiceLine.update).toHaveBeenCalledWith({
      where: { id: 'line-existing' },
      data: expect.objectContaining({
        productSnapshotJson: { productId: 'frozen' },
        priceSnapshotJson: { priceId: 'frozen_price' },
      }),
    });
    expect(tx.billingInvoiceLine.create).not.toHaveBeenCalled();
  });

  it('stores draft invoice without official number', async () => {
    prisma.billingInvoice.findUnique.mockResolvedValue(null);
    tx.billingInvoice.create.mockResolvedValue({ id: 'local-draft' });

    await service.mirrorStripeInvoice({
      ...baseInvoice,
      status: 'draft',
      number: null,
      amount_paid: 0,
      amount_remaining: 5355,
      status_transitions: { paid_at: null, finalized_at: null, voided_at: null },
    } as Stripe.Invoice);

    expect(tx.billingInvoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        invoiceNumber: null,
        status: InvoiceStatus.DRAFT,
        paidAt: null,
      }),
    });
  });

  it('maps void invoice without paid timestamp', async () => {
    prisma.billingInvoice.findUnique.mockResolvedValue(null);
    tx.billingInvoice.create.mockResolvedValue({ id: 'local-void' });

    await service.mirrorStripeInvoice({
      ...baseInvoice,
      status: 'void',
      amount_paid: 0,
      status_transitions: {
        paid_at: 1_700_000_100,
        finalized_at: 1_700_000_050,
        voided_at: 1_700_000_200,
      },
    } as Stripe.Invoice);

    expect(tx.billingInvoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: InvoiceStatus.VOID,
        paidAt: null,
        voidedAt: new Date(1_700_000_200 * 1000),
      }),
    });
  });

  it('returns null when no local subscription mapping exists', async () => {
    prisma.billingSubscription.findFirst.mockResolvedValue(null);

    const id = await service.mirrorStripeInvoice(baseInvoice);

    expect(id).toBeNull();
    expect(prisma.billingInvoice.findUnique).not.toHaveBeenCalled();
  });
});
