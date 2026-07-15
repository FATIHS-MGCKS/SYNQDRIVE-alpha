import {
  BillingPaymentStatus,
  BillingRefundStatus,
} from '@prisma/client';
import {
  computeRefundedTotal,
  reconcilePaymentRefundState,
  resolveRefundPartialFlag,
  sanitizeProviderErrorMessage,
} from './billing-payment-ledger';

describe('billing-payment-ledger domain', () => {
  describe('sanitizeProviderErrorMessage', () => {
    it('redacts card numbers and stripe secrets', () => {
      const raw =
        'Card 4242 4242 4242 4242 declined. sk_live_abc123xyz should not leak.';
      expect(sanitizeProviderErrorMessage(raw)).toBe(
        'Card [redacted] declined. [redacted] should not leak.',
      );
    });

    it('truncates long messages', () => {
      const raw = 'x'.repeat(300);
      const safe = sanitizeProviderErrorMessage(raw);
      expect(safe).toHaveLength(240);
      expect(safe?.endsWith('...')).toBe(true);
    });

    it('returns null for empty input', () => {
      expect(sanitizeProviderErrorMessage(null)).toBeNull();
      expect(sanitizeProviderErrorMessage('   ')).toBeNull();
    });
  });

  describe('computeRefundedTotal', () => {
    it('sums only succeeded refunds', () => {
      const total = computeRefundedTotal([
        { amountCents: 500, status: BillingRefundStatus.SUCCEEDED },
        { amountCents: 300, status: BillingRefundStatus.PENDING },
        { amountCents: 200, status: BillingRefundStatus.SUCCEEDED },
      ]);
      expect(total).toBe(700);
    });
  });

  describe('resolveRefundPartialFlag', () => {
    it('marks partial when remaining balance stays positive', () => {
      expect(
        resolveRefundPartialFlag({
          refundAmountCents: 400,
          paymentAmountCents: 1000,
          refundedBeforeCents: 0,
        }),
      ).toBe(true);
    });

    it('marks full when refund closes the payment', () => {
      expect(
        resolveRefundPartialFlag({
          refundAmountCents: 600,
          paymentAmountCents: 1000,
          refundedBeforeCents: 400,
        }),
      ).toBe(false);
    });
  });

  describe('reconcilePaymentRefundState', () => {
    it('sets partially refunded status and remaining amount', () => {
      const result = reconcilePaymentRefundState({
        paymentAmountCents: 1000,
        refundedAmountCents: 400,
        currentStatus: BillingPaymentStatus.SUCCEEDED,
      });
      expect(result).toEqual({
        status: BillingPaymentStatus.PARTIALLY_REFUNDED,
        refundedAmountCents: 400,
        remainingAmountCents: 600,
      });
    });

    it('sets fully refunded status when balance is zero', () => {
      const result = reconcilePaymentRefundState({
        paymentAmountCents: 1000,
        refundedAmountCents: 1000,
        currentStatus: BillingPaymentStatus.SUCCEEDED,
      });
      expect(result).toEqual({
        status: BillingPaymentStatus.REFUNDED,
        refundedAmountCents: 1000,
        remainingAmountCents: 0,
      });
    });

    it('restores succeeded when no succeeded refunds remain', () => {
      const result = reconcilePaymentRefundState({
        paymentAmountCents: 1000,
        refundedAmountCents: 0,
        currentStatus: BillingPaymentStatus.PARTIALLY_REFUNDED,
      });
      expect(result.status).toBe(BillingPaymentStatus.SUCCEEDED);
      expect(result.remainingAmountCents).toBe(1000);
    });
  });
});
