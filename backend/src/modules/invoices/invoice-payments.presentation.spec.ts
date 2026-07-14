import {
  invoicePaymentMethodLabelDe,
  invoicePaymentStatusLabel,
  isProviderBackedPayment,
  presentInvoicePayment,
} from './invoice-payments.presentation';
import { InvoicePaymentMethod } from '@prisma/client';

describe('invoice-payments.presentation', () => {
  it('maps German method labels', () => {
    expect(invoicePaymentMethodLabelDe('CARD')).toBe('Karte');
    expect(invoicePaymentMethodLabelDe('BANK_TRANSFER')).toBe('Überweisung');
    expect(invoicePaymentMethodLabelDe('CASH')).toBe('Barzahlung');
    expect(invoicePaymentMethodLabelDe('STRIPE')).toBe('Stripe');
    expect(invoicePaymentMethodLabelDe('DIRECT_DEBIT')).toBe('Lastschrift');
    expect(invoicePaymentMethodLabelDe('OTHER')).toBe('Sonstiges');
  });

  it('detects provider-backed payments', () => {
    expect(
      isProviderBackedPayment({
        stripePaymentIntentId: 'pi_123',
        stripeChargeId: null,
        bookingPaymentRequestId: null,
      }),
    ).toBe(true);
    expect(
      isProviderBackedPayment({
        stripePaymentIntentId: null,
        stripeChargeId: null,
        bookingPaymentRequestId: null,
      }),
    ).toBe(false);
  });

  it('presents payment with status and actor', () => {
    const payment = {
      id: 'pay-1',
      organizationId: 'org-1',
      invoiceId: 'inv-1',
      amountCents: 5000,
      method: InvoicePaymentMethod.CARD,
      paidAt: new Date('2026-07-14T10:00:00Z'),
      reference: 'REF-1',
      note: null,
      createdByUserId: 'user-1',
      stripePaymentIntentId: 'pi_abc',
      stripeChargeId: null,
      bookingPaymentRequestId: null,
      createdAt: new Date('2026-07-14T10:00:00Z'),
    };

    const presented = presentInvoicePayment(payment, 'Tom Tenant');
    expect(presented.method).toBe('CARD');
    expect(presented.statusKind).toBe('provider_confirmed');
    expect(presented.statusLabel).toBe('Anbieter bestätigt');
    expect(presented.createdByName).toBe('Tom Tenant');
    expect(presented.isProviderBacked).toBe(true);
  });

  it('labels manual payments as recorded', () => {
    const status = invoicePaymentStatusLabel({
      stripePaymentIntentId: null,
      stripeChargeId: null,
      bookingPaymentRequestId: null,
    });
    expect(status.statusKind).toBe('recorded');
    expect(status.statusLabel).toBe('Erfasst');
  });
});
