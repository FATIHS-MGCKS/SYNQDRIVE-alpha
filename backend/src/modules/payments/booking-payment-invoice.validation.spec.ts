import { describe, expect, it } from '@jest/globals';
import { validateSnapshotInvoiceAlignment } from './booking-payment-invoice.validation';
import { InvalidCurrencyError } from './payment-fee.errors';
import { SnapshotInvoiceConflictError } from './booking-payment-request.errors';

describe('validateSnapshotInvoiceAlignment', () => {
  const snapshot = { currency: 'EUR', depositAmountCents: 50_000 };

  it('accepts aligned rental amount and currency', () => {
    expect(() =>
      validateSnapshotInvoiceAlignment({
        snapshot,
        invoice: {
          currency: 'EUR',
          totalCents: 61_900,
          paidCents: 0,
          outstandingCents: 61_900,
          status: 'ISSUED',
          bookingId: 'bk-1',
        },
        rentalPaymentAmountCents: 11_900,
        excludedDepositCents: 50_000,
      }),
    ).not.toThrow();
  });

  it('rejects unsupported invoice currency', () => {
    expect(() =>
      validateSnapshotInvoiceAlignment({
        snapshot,
        invoice: {
          currency: 'USD',
          totalCents: 11_900,
          paidCents: 0,
          outstandingCents: 11_900,
          status: 'ISSUED',
          bookingId: 'bk-1',
        },
        rentalPaymentAmountCents: 11_900,
        excludedDepositCents: 0,
      }),
    ).toThrow(InvalidCurrencyError);
  });

  it('rejects when rental amount exceeds outstanding', () => {
    expect(() =>
      validateSnapshotInvoiceAlignment({
        snapshot,
        invoice: {
          currency: 'EUR',
          totalCents: 10_000,
          paidCents: 0,
          outstandingCents: 10_000,
          status: 'ISSUED',
          bookingId: 'bk-1',
        },
        rentalPaymentAmountCents: 11_900,
        excludedDepositCents: 0,
      }),
    ).toThrow(SnapshotInvoiceConflictError);
  });
});
