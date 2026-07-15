import { InvoiceStatus } from '@prisma/client';
import Stripe from 'stripe';
import {
  buildMirroredInvoicePayload,
  formatInvoiceNumberForDisplay,
  mergeImmutableInvoiceSnapshots,
  mergeImmutableLineSnapshots,
  resolveMirroredPaidAt,
  resolveMirroredVoidedAt,
} from './stripe-invoice-mirror';

const organization = {
  companyName: 'Acme GmbH',
  legalCompanyName: 'Acme Gesellschaft mit beschränkter Haftung',
  vatId: 'DE123456789',
  taxId: '27/123/45678',
  taxNumber: '27/123/45678',
  invoiceEmail: 'billing@acme.test',
  address: 'Hauptstraße 1',
  city: 'Berlin',
  state: 'BE',
  zip: '10115',
  country: 'DE',
};

function buildStripeInvoice(
  overrides: Partial<Stripe.Invoice> & { status: Stripe.Invoice.Status },
): Stripe.Invoice {
  return {
    id: 'in_test_1',
    object: 'invoice',
    customer: 'cus_1',
    subscription: 'sub_1',
    livemode: false,
    currency: 'eur',
    created: 1_700_000_000,
    due_date: 1_700_086_400,
    period_start: 1_699_000_000,
    period_end: 1_701_000_000,
    subtotal: 5000,
    tax: 950,
    total: 5950,
    amount_due: 5950,
    amount_paid: 0,
    amount_remaining: 5950,
    hosted_invoice_url: 'https://invoice.stripe.com/i/test',
    invoice_pdf: 'https://pay.stripe.com/invoice/pdf/test',
    customer_name: 'Acme GmbH',
    customer_email: 'billing@acme.test',
    customer_phone: '+49123456789',
    customer_address: {
      line1: 'Hauptstraße 1',
      city: 'Berlin',
      postal_code: '10115',
      country: 'DE',
    },
    customer_tax_ids: [{ type: 'eu_vat', value: 'DE123456789' }],
    status_transitions: {
      finalized_at: 1_700_000_100,
      paid_at: null,
      voided_at: null,
      marked_uncollectible_at: null,
    },
    total_discount_amounts: [],
    lines: {
      object: 'list',
      data: [
        {
          id: 'il_1',
          object: 'line_item',
          amount: 5000,
          description: 'SynqDrive Rental',
          quantity: 2,
          price: {
            id: 'price_1',
            object: 'price',
            unit_amount: 2500,
            currency: 'eur',
            product: {
              id: 'prod_1',
              object: 'product',
              name: 'SynqDrive Rental',
              metadata: { productKey: 'RENTAL' },
            },
          },
          tax_amounts: [{ amount: 950, inclusive: false, tax_rate: 'txr_1' }],
          tax_rates: [{ effective_percentage: 19 }],
          discount_amounts: [],
        } as unknown as Stripe.InvoiceLineItem,
      ],
      has_more: false,
      url: '/v1/invoices/in_test_1/lines',
    },
    ...overrides,
  } as Stripe.Invoice;
}

describe('stripe-invoice-mirror domain', () => {
  it('maps draft invoice without official number', () => {
    const payload = buildMirroredInvoicePayload({
      invoice: buildStripeInvoice({ status: 'draft', number: null }),
      organization,
    });

    expect(payload.invoiceNumber).toBeNull();
    expect(formatInvoiceNumberForDisplay(payload.invoiceNumber)).toBe('Noch nicht finalisiert');
    expect(payload.status).toBe(InvoiceStatus.DRAFT);
  });

  it('maps open invoice with official number and hosted url', () => {
    const payload = buildMirroredInvoicePayload({
      invoice: buildStripeInvoice({ status: 'open', number: 'ACME-2026-0007' }),
      organization,
    });

    expect(payload.invoiceNumber).toBe('ACME-2026-0007');
    expect(payload.status).toBe(InvoiceStatus.OPEN);
    expect(payload.hostedInvoiceUrl).toContain('stripe.com');
    expect(payload.paidAt).toBeNull();
  });

  it('maps paid invoice with paid timestamp only when paid', () => {
    const payload = buildMirroredInvoicePayload({
      invoice: buildStripeInvoice({
        status: 'paid',
        number: 'ACME-2026-0008',
        amount_paid: 5950,
        amount_remaining: 0,
        status_transitions: {
          finalized_at: 1_700_000_100,
          paid_at: 1_700_010_000,
          voided_at: null,
          marked_uncollectible_at: null,
        },
      }),
      organization,
    });

    expect(payload.status).toBe(InvoiceStatus.PAID);
    expect(payload.paidAt).toEqual(new Date(1_700_010_000 * 1000));
    expect(resolveMirroredPaidAt({ status: InvoiceStatus.VOID, stripePaidAt: payload.paidAt })).toBeNull();
  });

  it('maps void invoice without paid timestamp', () => {
    const payload = buildMirroredInvoicePayload({
      invoice: buildStripeInvoice({
        status: 'void',
        number: 'ACME-2026-0009',
        status_transitions: {
          finalized_at: 1_700_000_100,
          paid_at: 1_700_010_000,
          voided_at: 1_700_020_000,
          marked_uncollectible_at: null,
        },
      }),
      organization,
    });

    expect(payload.status).toBe(InvoiceStatus.VOID);
    expect(payload.paidAt).toBeNull();
    expect(payload.voidedAt).toEqual(new Date(1_700_020_000 * 1000));
  });

  it('maps uncollectible as its own status', () => {
    const payload = buildMirroredInvoicePayload({
      invoice: buildStripeInvoice({ status: 'uncollectible', number: 'ACME-2026-0010' }),
      organization,
    });

    expect(payload.status).toBe(InvoiceStatus.UNCOLLECTIBLE);
    expect(payload.paidAt).toBeNull();
  });

  it('maps discount and tax totals', () => {
    const payload = buildMirroredInvoicePayload({
      invoice: buildStripeInvoice({
        status: 'open',
        number: 'ACME-2026-0011',
        subtotal: 5000,
        tax: 950,
        total: 5450,
        total_discount_amounts: [{ amount: 500, discount: 'di_1' }],
        lines: {
          object: 'list',
          has_more: false,
          url: '/v1/invoices/in_test_1/lines',
          data: [
            {
              id: 'il_disc',
              object: 'line_item',
              amount: 5000,
              description: 'Discounted line',
              quantity: 2,
              price: { id: 'price_1', object: 'price', unit_amount: 2500, currency: 'eur' },
              discount_amounts: [{ amount: 500, discount: 'di_1' }],
              tax_amounts: [{ amount: 950, inclusive: false, tax_rate: 'txr_1' }],
              tax_rates: [{ effective_percentage: 19 }],
            } as unknown as Stripe.InvoiceLineItem,
          ],
        },
      }),
      organization,
    });

    expect(payload.discountAmountCents).toBe(500);
    expect(payload.taxAmountCents).toBe(950);
    expect(payload.lines[0].discountCents).toBe(500);
    expect(payload.lines[0].taxCents).toBe(950);
  });

  it('maps multiple invoice lines with product and price snapshots', () => {
    const payload = buildMirroredInvoicePayload({
      invoice: buildStripeInvoice({
        status: 'open',
        number: 'ACME-2026-0012',
        lines: {
          object: 'list',
          has_more: false,
          url: '/v1/invoices/in_test_1/lines',
          data: [
            {
              id: 'il_a',
              object: 'line_item',
              amount: 3000,
              description: 'Line A',
              quantity: 1,
              price: {
                id: 'price_a',
                object: 'price',
                unit_amount: 3000,
                currency: 'eur',
                product: { id: 'prod_a', object: 'product', name: 'Product A' },
              },
            } as unknown as Stripe.InvoiceLineItem,
            {
              id: 'il_b',
              object: 'line_item',
              amount: 2000,
              description: 'Line B',
              quantity: 2,
              price: {
                id: 'price_b',
                object: 'price',
                unit_amount: 1000,
                currency: 'eur',
                product: { id: 'prod_b', object: 'product', name: 'Product B' },
              },
            } as unknown as Stripe.InvoiceLineItem,
          ],
        },
      }),
      organization,
    });

    expect(payload.lines).toHaveLength(2);
    expect(payload.lines[0].productSnapshotJson).toMatchObject({ productId: 'prod_a' });
    expect(payload.lines[1].priceSnapshotJson).toMatchObject({ priceId: 'price_b' });
  });

  it('preserves immutable invoice snapshots on merge', () => {
    const existing = {
      customerSnapshotJson: { name: 'Frozen GmbH', email: 'old@acme.test', phone: null },
      companySnapshotJson: { companyName: 'Frozen GmbH', legalCompanyName: null, vatId: 'DE999', taxId: null, taxNumber: null, invoiceEmail: null },
      billingAddressJson: { line1: 'Frozen 1', line2: null, city: 'Hamburg', state: null, postalCode: '20095', country: 'DE' },
      taxIdSnapshot: 'DE999',
    };

    const merged = mergeImmutableInvoiceSnapshots(existing, {
      customerSnapshotJson: { name: 'New GmbH', email: 'new@acme.test', phone: null },
      companySnapshotJson: { companyName: 'New GmbH', legalCompanyName: null, vatId: 'DE111', taxId: null, taxNumber: null, invoiceEmail: null },
      billingAddressJson: null,
      taxIdSnapshot: 'DE111',
    });

    expect(merged.customerSnapshotJson.name).toBe('Frozen GmbH');
    expect(merged.companySnapshotJson.companyName).toBe('Frozen GmbH');
    expect(merged.taxIdSnapshot).toBe('DE999');
  });

  it('preserves immutable line snapshots on merge', () => {
    const merged = mergeImmutableLineSnapshots(
      { productSnapshotJson: { productId: 'frozen' }, priceSnapshotJson: { priceId: 'frozen_price' } },
      { productSnapshotJson: { productId: 'new' }, priceSnapshotJson: { priceId: 'new_price' } },
    );

    expect(merged.productSnapshotJson).toEqual({ productId: 'frozen' });
    expect(merged.priceSnapshotJson).toEqual({ priceId: 'frozen_price' });
  });

  it('clears paidAt for failed/open transitions via status rule helper', () => {
    expect(
      resolveMirroredPaidAt({
        status: InvoiceStatus.OPEN,
        stripePaidAt: new Date('2026-01-01'),
      }),
    ).toBeNull();
    expect(
      resolveMirroredVoidedAt({
        status: InvoiceStatus.VOID,
        stripeVoidedAt: new Date('2026-02-01'),
      }),
    ).toEqual(new Date('2026-02-01'));
  });
});
