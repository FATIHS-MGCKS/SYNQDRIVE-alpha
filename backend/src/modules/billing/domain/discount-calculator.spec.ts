import { DiscountKind } from './billing-domain.types';
import { ResolvedDiscount } from './billing-resolver.types';
import {
  applyDiscounts,
  DiscountApplicationErrorCode,
  validateDiscountSchedule,
} from './discount-calculator';

function subtotalDiscount(
  partial: Partial<ResolvedDiscount> & Pick<ResolvedDiscount, 'id' | 'kind'>,
): ResolvedDiscount {
  return {
    source: 'BILLING_DISCOUNT',
    applicationPhase: 'SUBTOTAL',
    percentBps: null,
    fixedAmountCents: null,
    currency: null,
    customUnitPriceCents: null,
    customMonthlyMinimumCents: null,
    subscriptionItemId: null,
    priceBookId: null,
    priceVersionId: null,
    reason: null,
    validFrom: new Date('2026-01-01'),
    validTo: null,
    sortOrder: 0,
    ...partial,
  };
}

describe('discount-calculator', () => {
  describe('applyDiscounts', () => {
    it('applies percentage discount to base amount', () => {
      const result = applyDiscounts({
        baseAmountCents: 10_000,
        currency: 'EUR',
        discounts: [
          subtotalDiscount({
            id: 'd1',
            kind: DiscountKind.PERCENTAGE,
            percentBps: 1000,
            sortOrder: 0,
          }),
        ],
      });

      expect(result.appliedDiscounts).toHaveLength(1);
      expect(result.appliedDiscounts[0].appliedAmountCents).toBe(1000);
      expect(result.amountAfterDiscountCents).toBe(9000);
      expect(result.totalDiscountCents).toBe(1000);
    });

    it('applies fixed amount discount', () => {
      const result = applyDiscounts({
        baseAmountCents: 5000,
        currency: 'EUR',
        discounts: [
          subtotalDiscount({
            id: 'd1',
            kind: DiscountKind.FIXED_AMOUNT,
            fixedAmountCents: 1500,
            currency: 'EUR',
            sortOrder: 0,
          }),
        ],
      });

      expect(result.amountAfterDiscountCents).toBe(3500);
      expect(result.totalDiscountCents).toBe(1500);
    });

    it('skips expired discounts', () => {
      const result = applyDiscounts({
        baseAmountCents: 5000,
        currency: 'EUR',
        asOf: new Date('2026-07-01'),
        discounts: [
          subtotalDiscount({
            id: 'd-expired',
            kind: DiscountKind.PERCENTAGE,
            percentBps: 5000,
            validTo: new Date('2026-06-30'),
            sortOrder: 0,
          }),
        ],
      });

      expect(result.appliedDiscounts).toHaveLength(0);
      expect(result.skippedDiscounts[0].code).toBe(DiscountApplicationErrorCode.DISCOUNT_EXPIRED);
      expect(result.amountAfterDiscountCents).toBe(5000);
    });

    it('skips future discounts', () => {
      const result = applyDiscounts({
        baseAmountCents: 5000,
        currency: 'EUR',
        asOf: new Date('2026-07-01'),
        discounts: [
          subtotalDiscount({
            id: 'd-future',
            kind: DiscountKind.PERCENTAGE,
            percentBps: 5000,
            validFrom: new Date('2026-08-01'),
            sortOrder: 0,
          }),
        ],
      });

      expect(result.appliedDiscounts).toHaveLength(0);
      expect(result.skippedDiscounts[0].code).toBe(
        DiscountApplicationErrorCode.DISCOUNT_NOT_YET_VALID,
      );
    });

    it('applies item-scoped discount only for matching subscription item', () => {
      const result = applyDiscounts({
        baseAmountCents: 4000,
        currency: 'EUR',
        subscriptionItemId: 'item-base',
        discounts: [
          subtotalDiscount({
            id: 'd-item',
            kind: DiscountKind.FIXED_AMOUNT,
            fixedAmountCents: 500,
            currency: 'EUR',
            subscriptionItemId: 'item-base',
            sortOrder: 0,
          }),
          subtotalDiscount({
            id: 'd-other',
            kind: DiscountKind.FIXED_AMOUNT,
            fixedAmountCents: 500,
            currency: 'EUR',
            subscriptionItemId: 'item-addon',
            sortOrder: 1,
          }),
        ],
      });

      expect(result.appliedDiscounts).toHaveLength(1);
      expect(result.appliedDiscounts[0].discountId).toBe('d-item');
      expect(result.skippedDiscounts.some((s) => s.discountId === 'd-other')).toBe(true);
    });

    it('applies subscription-wide discount when subscriptionItemId is null', () => {
      const result = applyDiscounts({
        baseAmountCents: 4000,
        currency: 'EUR',
        subscriptionItemId: 'item-base',
        discounts: [
          subtotalDiscount({
            id: 'd-sub',
            kind: DiscountKind.PERCENTAGE,
            percentBps: 2500,
            subscriptionItemId: null,
            sortOrder: 0,
          }),
        ],
      });

      expect(result.amountAfterDiscountCents).toBe(3000);
    });

    it('clamps fixed discount so amount does not go below zero', () => {
      const result = applyDiscounts({
        baseAmountCents: 1000,
        currency: 'EUR',
        discounts: [
          subtotalDiscount({
            id: 'd-big',
            kind: DiscountKind.FIXED_AMOUNT,
            fixedAmountCents: 2500,
            currency: 'EUR',
            sortOrder: 0,
          }),
        ],
      });

      expect(result.appliedDiscounts[0].appliedAmountCents).toBe(1000);
      expect(result.amountAfterDiscountCents).toBe(0);
    });

    it('skips fixed discount on currency mismatch', () => {
      const result = applyDiscounts({
        baseAmountCents: 2000,
        currency: 'EUR',
        discounts: [
          subtotalDiscount({
            id: 'd-usd',
            kind: DiscountKind.FIXED_AMOUNT,
            fixedAmountCents: 500,
            currency: 'USD',
            sortOrder: 0,
          }),
        ],
      });

      expect(result.appliedDiscounts).toHaveLength(0);
      expect(result.skippedDiscounts[0].code).toBe(
        DiscountApplicationErrorCode.DISCOUNT_CURRENCY_MISMATCH,
      );
    });

    it('applies multiple discounts sequentially without double application', () => {
      const result = applyDiscounts({
        baseAmountCents: 10_000,
        currency: 'EUR',
        discounts: [
          subtotalDiscount({
            id: 'd1',
            kind: DiscountKind.PERCENTAGE,
            percentBps: 1000,
            sortOrder: 0,
          }),
          subtotalDiscount({
            id: 'd2',
            kind: DiscountKind.FIXED_AMOUNT,
            fixedAmountCents: 500,
            currency: 'EUR',
            sortOrder: 1,
          }),
        ],
      });

      expect(result.appliedDiscounts).toHaveLength(2);
      expect(result.amountAfterDiscountCents).toBe(8500);
      expect(result.totalDiscountCents).toBe(1500);
    });
  });

  describe('validateDiscountSchedule', () => {
    it('rejects duplicate sort order', () => {
      const errors = validateDiscountSchedule([
        subtotalDiscount({ id: 'a', kind: DiscountKind.PERCENTAGE, percentBps: 1000, sortOrder: 0 }),
        subtotalDiscount({ id: 'b', kind: DiscountKind.PERCENTAGE, percentBps: 500, sortOrder: 0 }),
      ]);
      expect(errors.some((e) => e.code === DiscountApplicationErrorCode.DISCOUNT_DUPLICATE_SORT_ORDER)).toBe(
        true,
      );
    });

    it('rejects invalid percent values', () => {
      const errors = validateDiscountSchedule([
        subtotalDiscount({ id: 'a', kind: DiscountKind.PERCENTAGE, percentBps: 20_000, sortOrder: 0 }),
      ]);
      expect(errors.some((e) => e.code === DiscountApplicationErrorCode.DISCOUNT_PERCENT_INVALID)).toBe(
        true,
      );
    });
  });
});
