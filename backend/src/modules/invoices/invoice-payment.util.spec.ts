import { InvoicePaymentMethod, OrgInvoiceStatus } from '@prisma/client';
import {
  computeInvoicePaymentState,
  invoicePaymentMethodLabel,
  resolvePaymentSource,
  validateInvoicePaymentAmount,
} from './invoice-payment.util';

describe('invoice-payment.util', () => {
  describe('invoicePaymentMethodLabel', () => {
    it('returns German labels for known methods', () => {
      expect(invoicePaymentMethodLabel(InvoicePaymentMethod.BANK_TRANSFER)).toBe('Überweisung');
      expect(invoicePaymentMethodLabel(InvoicePaymentMethod.CARD)).toBe('Karte');
      expect(invoicePaymentMethodLabel(InvoicePaymentMethod.CASH)).toBe('Bar');
      expect(invoicePaymentMethodLabel(InvoicePaymentMethod.STRIPE)).toBe('Stripe');
      expect(invoicePaymentMethodLabel(InvoicePaymentMethod.OTHER)).toBe('Sonstige');
    });
  });

  describe('validateInvoicePaymentAmount', () => {
    const base = {
      currency: 'EUR',
      invoiceCurrency: 'EUR',
      invoiceStatus: OrgInvoiceStatus.ISSUED,
      outstandingCents: 10_000,
    };

    it('rejects zero or negative amounts', () => {
      expect(validateInvoicePaymentAmount({ ...base, amountCents: 0 }).ok).toBe(false);
      expect(validateInvoicePaymentAmount({ ...base, amountCents: -100 }).ok).toBe(false);
    });

    it('rejects currency mismatch', () => {
      const result = validateInvoicePaymentAmount({
        ...base,
        amountCents: 100,
        currency: 'USD',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain('currency');
    });

    it('rejects overpayment by default', () => {
      const result = validateInvoicePaymentAmount({
        ...base,
        amountCents: 10_001,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain('outstanding');
    });

    it('allows overpayment when explicitly enabled', () => {
      expect(
        validateInvoicePaymentAmount({
          ...base,
          amountCents: 10_001,
          allowOverpayment: true,
        }).ok,
      ).toBe(true);
    });

    it('rejects cancelled invoices', () => {
      const result = validateInvoicePaymentAmount({
        ...base,
        amountCents: 100,
        invoiceStatus: OrgInvoiceStatus.CANCELLED,
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('computeInvoicePaymentState', () => {
    it('sets PARTIALLY_PAID for partial payment', () => {
      const result = computeInvoicePaymentState({
        paidCents: 5_000,
        totalCents: 10_000,
        currentStatus: OrgInvoiceStatus.ISSUED,
        isOutgoing: true,
        completingPaymentPaidAt: new Date('2026-07-14T12:00:00.000Z'),
        previousPaidAt: null,
        newOutstandingCents: 5_000,
      });
      expect(result.status).toBe('PARTIALLY_PAID');
      expect(result.paidAt).toBeNull();
    });

    it('sets PAID and paidAt when fully settled', () => {
      const paidAt = new Date('2026-07-14T12:00:00.000Z');
      const result = computeInvoicePaymentState({
        paidCents: 10_000,
        totalCents: 10_000,
        currentStatus: OrgInvoiceStatus.PARTIALLY_PAID,
        isOutgoing: true,
        completingPaymentPaidAt: paidAt,
        previousPaidAt: null,
        newOutstandingCents: 0,
      });
      expect(result.status).toBe('PAID');
      expect(result.paidAt).toEqual(paidAt);
    });
  });

  describe('resolvePaymentSource', () => {
    it('defaults to MANUAL without provider id', () => {
      expect(resolvePaymentSource({})).toBe('MANUAL');
    });

    it('uses PROVIDER when providerTransactionId is set', () => {
      expect(
        resolvePaymentSource({ providerTransactionId: 'pi_123' }),
      ).toBe('PROVIDER');
    });
  });
});
