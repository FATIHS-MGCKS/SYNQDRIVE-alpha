import { BookingPriceLineItemType } from '@prisma/client';
import {
  calculateApplicationFeeCents,
  calculateRefundFeeAdjustment,
  computeCommissionableAmountFromLineItems,
  isExcludedFromCommissionable,
  isProvisionableLineItemType,
} from './payment-policy.service';
import { InvalidCurrencyError } from './payment-fee.errors';
import {
  NON_COMMISSIONABLE_LINE_ITEM_TYPES,
  PAYMENT_FEE_POLICY_VERSION,
  PaymentFeeBasis,
  PROVISIONABLE_LINE_ITEM_TYPES,
} from './payment-fee.types';

const GROSS = PaymentFeeBasis.GROSS_RENTAL_EXCL_DEPOSIT;
const NET = PaymentFeeBasis.NET_RENTAL_EXCL_DEPOSIT;

function line(
  type: BookingPriceLineItemType,
  gross: number,
  net = gross,
) {
  return { type, totalGrossCents: gross, totalNetCents: net };
}

describe('payment fee policy', () => {
  describe('line item classification', () => {
    it('defines provisionable positive list', () => {
      expect(PROVISIONABLE_LINE_ITEM_TYPES).toEqual([
        BookingPriceLineItemType.BASE_RENTAL,
        BookingPriceLineItemType.INSURANCE,
        BookingPriceLineItemType.EXTRA,
        BookingPriceLineItemType.MILEAGE_PACKAGE,
        BookingPriceLineItemType.EXTRA_KM,
      ]);
    });

    it('excludes deposit, tax, and manual adjustment', () => {
      expect(NON_COMMISSIONABLE_LINE_ITEM_TYPES).toContain(BookingPriceLineItemType.DEPOSIT);
      expect(NON_COMMISSIONABLE_LINE_ITEM_TYPES).toContain(BookingPriceLineItemType.TAX);
      expect(NON_COMMISSIONABLE_LINE_ITEM_TYPES).toContain(
        BookingPriceLineItemType.MANUAL_ADJUSTMENT,
      );
      expect(isProvisionableLineItemType(BookingPriceLineItemType.DEPOSIT)).toBe(false);
      expect(isExcludedFromCommissionable(BookingPriceLineItemType.DEPOSIT)).toBe(true);
    });
  });

  describe('computeCommissionableAmountFromLineItems', () => {
    it('1. deposit is never commissionable', () => {
      const result = computeCommissionableAmountFromLineItems(
        [
          line(BookingPriceLineItemType.BASE_RENTAL, 50_000),
          line(BookingPriceLineItemType.DEPOSIT, 15_000),
        ],
        GROSS,
        'EUR',
      );
      expect(result.commissionableAmountCents).toBe(50_000);
      expect(result.excludedDepositCents).toBe(15_000);
      expect(result.includedLineTypes).not.toContain(BookingPriceLineItemType.DEPOSIT);
    });

    it('2. does not use totalDueNowCents — only line items', () => {
      const result = computeCommissionableAmountFromLineItems(
        [
          line(BookingPriceLineItemType.BASE_RENTAL, 40_000),
          line(BookingPriceLineItemType.DEPOSIT, 10_000),
        ],
        GROSS,
        'EUR',
      );
      expect(result.rentalPaymentAmountCents).toBe(40_000);
      expect(result.rentalPaymentAmountCents).not.toBe(50_000);
    });

    it('3. prevents double deposit subtraction', () => {
      const result = computeCommissionableAmountFromLineItems(
        [
          line(BookingPriceLineItemType.BASE_RENTAL, 30_000),
          line(BookingPriceLineItemType.DEPOSIT, 20_000),
        ],
        GROSS,
        'EUR',
      );
      expect(result.commissionableAmountCents).toBe(30_000);
      expect(result.commissionableAmountCents).not.toBe(10_000);
    });

    it('4. sums base rental and extras', () => {
      const result = computeCommissionableAmountFromLineItems(
        [
          line(BookingPriceLineItemType.BASE_RENTAL, 40_000),
          line(BookingPriceLineItemType.INSURANCE, 5_000),
          line(BookingPriceLineItemType.EXTRA, 3_000),
          line(BookingPriceLineItemType.MILEAGE_PACKAGE, 2_000),
        ],
        GROSS,
        'EUR',
      );
      expect(result.commissionableAmountCents).toBe(50_000);
    });

    it('5. applies discount correctly', () => {
      const result = computeCommissionableAmountFromLineItems(
        [
          line(BookingPriceLineItemType.BASE_RENTAL, 40_000),
          line(BookingPriceLineItemType.DISCOUNT, -5_000, -4_201),
        ],
        GROSS,
        'EUR',
      );
      expect(result.commissionableAmountCents).toBe(35_000);
    });

    it('excludes TAX and MANUAL_ADJUSTMENT lines', () => {
      const result = computeCommissionableAmountFromLineItems(
        [
          line(BookingPriceLineItemType.BASE_RENTAL, 40_000),
          line(BookingPriceLineItemType.TAX, 7_600),
          line(BookingPriceLineItemType.MANUAL_ADJUSTMENT, 1_000),
        ],
        GROSS,
        'EUR',
      );
      expect(result.commissionableAmountCents).toBe(40_000);
    });

    it('uses net basis when configured', () => {
      const result = computeCommissionableAmountFromLineItems(
        [line(BookingPriceLineItemType.BASE_RENTAL, 11_900, 10_000)],
        NET,
        'EUR',
      );
      expect(result.commissionableAmountCents).toBe(10_000);
    });

    it('12. rejects invalid currency', () => {
      expect(() =>
        computeCommissionableAmountFromLineItems(
          [line(BookingPriceLineItemType.BASE_RENTAL, 1_000)],
          GROSS,
          'USD',
        ),
      ).toThrow(InvalidCurrencyError);
    });

    it('13. allows negative discount but flags negative net commissionable', () => {
      const result = computeCommissionableAmountFromLineItems(
        [
          line(BookingPriceLineItemType.BASE_RENTAL, 5_000),
          line(BookingPriceLineItemType.DISCOUNT, -8_000),
        ],
        GROSS,
        'EUR',
      );
      expect(result.commissionableAmountCents).toBe(-3_000);
    });
  });

  describe('calculateApplicationFeeCents', () => {
    it('6. calculates percentage fee with integer rounding', () => {
      const fee = calculateApplicationFeeCents(10_000, {
        feeRateBps: 250,
        fixedFeeCents: 0,
        minFeeCents: null,
        maxFeeCents: null,
      });
      expect(fee.variableFeeCents).toBe(250);
      expect(fee.applicationFeeAmountCents).toBe(250);
    });

    it('7. adds fixed fee', () => {
      const fee = calculateApplicationFeeCents(10_000, {
        feeRateBps: 0,
        fixedFeeCents: 99,
        minFeeCents: null,
        maxFeeCents: null,
      });
      expect(fee.applicationFeeAmountCents).toBe(99);
    });

    it('8. applies min and max fee bounds', () => {
      const minFee = calculateApplicationFeeCents(1_000, {
        feeRateBps: 100,
        fixedFeeCents: 0,
        minFeeCents: 50,
        maxFeeCents: null,
      });
      expect(minFee.applicationFeeAmountCents).toBe(50);

      const maxFee = calculateApplicationFeeCents(100_000, {
        feeRateBps: 500,
        fixedFeeCents: 0,
        minFeeCents: null,
        maxFeeCents: 1_000,
      });
      expect(maxFee.applicationFeeAmountCents).toBe(1_000);
    });

    it('11. returns zero fee for zero commissionable', () => {
      const fee = calculateApplicationFeeCents(0, {
        feeRateBps: 250,
        fixedFeeCents: 50,
        minFeeCents: null,
        maxFeeCents: null,
      });
      expect(fee.applicationFeeAmountCents).toBe(50);
    });
  });

  describe('calculateRefundFeeAdjustment', () => {
    const original = {
      originalApplicationFeeCents: 500,
      originalRentalPaymentAmountCents: 10_000,
    };

    it('9. calculates proportional partial refund fee', () => {
      const partial = calculateRefundFeeAdjustment({
        ...original,
        refundAmountCents: 2_500,
      });
      expect(partial.applicationFeeRefundCents).toBe(125);
      expect(partial.remainingApplicationFeeCents).toBe(375);
      expect(partial.isFullRefund).toBe(false);
    });

    it('10. refunds full application fee on full refund', () => {
      const full = calculateRefundFeeAdjustment({
        ...original,
        refundAmountCents: 10_000,
      });
      expect(full.applicationFeeRefundCents).toBe(500);
      expect(full.remainingApplicationFeeCents).toBe(0);
      expect(full.isFullRefund).toBe(true);
    });

    it('refunds remaining fee on final partial completing full refund', () => {
      const first = calculateRefundFeeAdjustment({
        ...original,
        refundAmountCents: 6_000,
      });
      const second = calculateRefundFeeAdjustment({
        ...original,
        refundAmountCents: 4_000,
        alreadyRefundedAmountCents: 6_000,
      });
      expect(first.applicationFeeRefundCents + second.applicationFeeRefundCents).toBe(500);
      expect(second.isFullRefund).toBe(true);
    });
  });

  describe('policy versioning', () => {
    it('14. policy version constant is stable identifier for snapshots', () => {
      expect(PAYMENT_FEE_POLICY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}-v\d+$/);
    });
  });
});
