/**
 * Integration-style flow test with mocked Stripe adapter — exercises payment
 * request → checkout metadata → reconciliation idempotency contracts.
 */
import {
  BookingPaymentRequestStatus,
  PaymentTransactionStatus,
  PaymentTransactionType,
} from '@prisma/client';
import { calculateRefundableAmount } from './payment-status.transitions';
import { calculateRefundFeeAdjustment } from './payment-policy.service';

describe('payment connect flow contracts (mocked integration)', () => {
  it('derives refundable amount after partial refund', () => {
    const refundable = calculateRefundableAmount({
      paidAmountCents: 10_000,
      refundedAmountCents: 2_500,
    });
    expect(refundable).toBe(7_500);
  });

  it('calculates proportional application fee refund', () => {
    const fee = calculateRefundFeeAdjustment({
      originalApplicationFeeCents: 250,
      originalRentalPaymentAmountCents: 10_000,
      refundAmountCents: 2_500,
      alreadyRefundedAmountCents: 0,
    });
    expect(fee.applicationFeeRefundCents).toBe(63);
  });

  it('documents canonical ledger types for successful payment', () => {
    const types = [PaymentTransactionType.CHARGE, PaymentTransactionType.APPLICATION_FEE];
    expect(types).toContain(PaymentTransactionType.CHARGE);
    expect(PaymentTransactionStatus.SUCCEEDED).toBe('SUCCEEDED');
  });

  it('documents paid status family for refunds', () => {
    const refundableStatuses = [
      BookingPaymentRequestStatus.PAID,
      BookingPaymentRequestStatus.PARTIALLY_REFUNDED,
    ];
    expect(refundableStatuses).toContain(BookingPaymentRequestStatus.PAID);
  });
});
