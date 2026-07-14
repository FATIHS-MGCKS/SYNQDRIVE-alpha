import {
  BookingPaymentPurpose,
  BookingPaymentRequestStatus,
  BookingPaymentStatus,
  OrganizationPaymentAccountStatus,
  PaymentProvider,
  PaymentTransactionStatus,
  PaymentTransactionType,
  StripeAccountGeneration,
  StripeConnectWebhookProcessingStatus,
} from '@prisma/client';

/**
 * Schema contract tests — document enums and invariants without requiring a live DB.
 */
describe('payments domain schema contracts', () => {
  it('defines payment provider enum', () => {
    expect(PaymentProvider.STRIPE).toBe('STRIPE');
  });

  it('defines organization payment account statuses', () => {
    expect(Object.values(OrganizationPaymentAccountStatus)).toEqual(
      expect.arrayContaining(['PENDING', 'ONBOARDING', 'ACTIVE', 'RESTRICTED', 'DISABLED', 'REJECTED']),
    );
  });

  it('defines derived booking payment status summary values', () => {
    expect(Object.values(BookingPaymentStatus)).toEqual(
      expect.arrayContaining(['UNPAID', 'PENDING', 'PARTIALLY_PAID', 'PAID', 'FAILED', 'REFUNDED']),
    );
  });

  it('defines booking payment request lifecycle statuses', () => {
    expect(Object.values(BookingPaymentRequestStatus)).toContain('OPEN');
    expect(Object.values(BookingPaymentRequestStatus)).toContain('LINK_SENT');
    expect(Object.values(BookingPaymentRequestStatus)).toContain('PAID');
    expect(Object.values(BookingPaymentRequestStatus)).toContain('DISPUTED');
    expect(Object.values(BookingPaymentRequestStatus)).not.toContain('CHECKOUT_PENDING');
  });

  it('defines booking payment purposes without deposit (BookingDeposit stays separate)', () => {
    expect(Object.values(BookingPaymentPurpose)).toEqual(
      expect.arrayContaining(['RENTAL_PAYMENT', 'BOOKING_INVOICE', 'INVOICE_SETTLEMENT']),
    );
    expect(Object.values(BookingPaymentPurpose)).not.toContain('DEPOSIT');
  });

  it('defines append-only ledger transaction types', () => {
    expect(Object.values(PaymentTransactionType)).toEqual(
      expect.arrayContaining(['CHARGE', 'APPLICATION_FEE', 'REFUND', 'DISPUTE']),
    );
  });

  it('defines stripe account generation adapter versions', () => {
    expect(Object.values(StripeAccountGeneration)).toEqual(['V1', 'V2']);
  });

  it('defines connect webhook processing statuses aligned with billing webhook pattern', () => {
    expect(Object.values(StripeConnectWebhookProcessingStatus)).toEqual(
      expect.arrayContaining(['RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED']),
    );
  });

  it('documents ledger transaction terminal statuses', () => {
    expect(Object.values(PaymentTransactionStatus)).toEqual(
      expect.arrayContaining(['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED']),
    );
  });
});
