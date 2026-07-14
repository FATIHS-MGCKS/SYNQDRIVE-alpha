import {
  assertPaymentRequestAlignment,
  extractPaymentRequestMetadata,
  shouldSkipDowngradeFromPaid,
} from './payment-reconciliation.util';
import { BookingPaymentRequestStatus } from '@prisma/client';
import { PaymentReconciliationAmountMismatchError } from './payment-reconciliation.errors';

describe('payment-reconciliation.util', () => {
  it('extracts metadata from safe event data', () => {
    const metadata = extractPaymentRequestMetadata({
      metadata: {
        organizationId: 'org-1',
        bookingId: 'b-1',
        invoiceId: 'inv-1',
        paymentRequestId: 'pr-1',
      },
    });
    expect(metadata?.paymentRequestId).toBe('pr-1');
  });

  it('detects paid statuses that must not be downgraded', () => {
    expect(shouldSkipDowngradeFromPaid(BookingPaymentRequestStatus.PAID)).toBe(true);
    expect(shouldSkipDowngradeFromPaid(BookingPaymentRequestStatus.PROCESSING)).toBe(false);
  });

  it('rejects amount mismatch against frozen payment request', () => {
    expect(() =>
      assertPaymentRequestAlignment({
        eventOrganizationId: 'org-1',
        metadata: {
          organizationId: 'org-1',
          bookingId: 'b-1',
          invoiceId: 'inv-1',
          paymentRequestId: 'pr-1',
        },
        request: {
          id: 'pr-1',
          organizationId: 'org-1',
          amountCents: 50_000,
          currency: 'EUR',
          stripeConnectedAccountId: 'acct_1',
        } as never,
        amountCents: 40_000,
        currency: 'EUR',
        connectedAccountId: 'acct_1',
      }),
    ).toThrow(PaymentReconciliationAmountMismatchError);
  });

  it('rejects currency mismatch against frozen payment request', () => {
    expect(() =>
      assertPaymentRequestAlignment({
        eventOrganizationId: 'org-1',
        metadata: {
          organizationId: 'org-1',
          bookingId: 'b-1',
          invoiceId: 'inv-1',
          paymentRequestId: 'pr-1',
        },
        request: {
          id: 'pr-1',
          organizationId: 'org-1',
          amountCents: 50_000,
          currency: 'EUR',
          stripeConnectedAccountId: 'acct_1',
        } as never,
        amountCents: 50_000,
        currency: 'USD',
        connectedAccountId: 'acct_1',
      }),
    ).toThrow();
  });

  it('rejects organization mismatch in metadata', () => {
    expect(() =>
      assertPaymentRequestAlignment({
        eventOrganizationId: 'org-1',
        metadata: {
          organizationId: 'org-other',
          bookingId: 'b-1',
          invoiceId: 'inv-1',
          paymentRequestId: 'pr-1',
        },
        request: {
          id: 'pr-1',
          organizationId: 'org-1',
          amountCents: 50_000,
          currency: 'EUR',
          stripeConnectedAccountId: 'acct_1',
        } as never,
        amountCents: 50_000,
        currency: 'EUR',
        connectedAccountId: 'acct_1',
      }),
    ).toThrow();
  });
});
