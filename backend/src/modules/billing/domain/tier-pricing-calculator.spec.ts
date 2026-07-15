import { BillingTierMode, BillingUsageCalculationStatus } from '@prisma/client';
import { PricingModel } from './billing-domain.types';
import {
  calculateTierPricing,
  TierScheduleTier,
  TierValidationErrorCode,
  validateTierSchedule,
} from './tier-pricing-calculator';

describe('tier-pricing-calculator', () => {
  const sampleTiers: TierScheduleTier[] = [
    { id: 't1', minVehicles: 1, maxVehicles: 8, unitPriceCents: 1000, sortOrder: 0 },
    { id: 't2', minVehicles: 9, maxVehicles: 19, unitPriceCents: 900, sortOrder: 1 },
    { id: 't3', minVehicles: 20, maxVehicles: null, unitPriceCents: 800, sortOrder: 2 },
  ];

  describe('validateTierSchedule', () => {
    it('accepts a contiguous schedule starting at 1 with unlimited last tier', () => {
      expect(validateTierSchedule(sampleTiers)).toHaveLength(0);
    });

    it('rejects empty schedule', () => {
      expect(validateTierSchedule([])).toEqual([{ code: TierValidationErrorCode.TIER_SCHEDULE_EMPTY }]);
    });

    it('rejects when first tier does not start at 1', () => {
      const errors = validateTierSchedule([
        { minVehicles: 2, maxVehicles: 10, unitPriceCents: 1000, sortOrder: 0 },
      ]);
      expect(errors.some((e) => e.code === TierValidationErrorCode.FIRST_TIER_NOT_ONE)).toBe(true);
    });

    it('rejects gaps between tiers', () => {
      const errors = validateTierSchedule([
        { minVehicles: 1, maxVehicles: 5, unitPriceCents: 1000, sortOrder: 0 },
        { minVehicles: 7, maxVehicles: null, unitPriceCents: 900, sortOrder: 1 },
      ]);
      expect(errors.some((e) => e.code === TierValidationErrorCode.TIER_GAP)).toBe(true);
    });

    it('rejects overlapping tiers', () => {
      const errors = validateTierSchedule([
        { minVehicles: 1, maxVehicles: 10, unitPriceCents: 1000, sortOrder: 0 },
        { minVehicles: 8, maxVehicles: 20, unitPriceCents: 900, sortOrder: 1 },
      ]);
      expect(errors.some((e) => e.code === TierValidationErrorCode.TIERS_OVERLAP)).toBe(true);
    });

    it('rejects negative unit prices', () => {
      const errors = validateTierSchedule([
        { minVehicles: 1, maxVehicles: null, unitPriceCents: -1, sortOrder: 0 },
      ]);
      expect(errors.some((e) => e.code === TierValidationErrorCode.NEGATIVE_UNIT_PRICE)).toBe(true);
    });

    it('rejects unlimited tier that is not last', () => {
      const errors = validateTierSchedule([
        { minVehicles: 1, maxVehicles: null, unitPriceCents: 1000, sortOrder: 0 },
        { minVehicles: 2, maxVehicles: 5, unitPriceCents: 900, sortOrder: 1 },
      ]);
      expect(errors.some((e) => e.code === TierValidationErrorCode.UNLIMITED_NOT_LAST)).toBe(true);
    });

    it('rejects duplicate sortOrder', () => {
      const errors = validateTierSchedule([
        { minVehicles: 1, maxVehicles: 5, unitPriceCents: 1000, sortOrder: 0 },
        { minVehicles: 6, maxVehicles: null, unitPriceCents: 900, sortOrder: 0 },
      ]);
      expect(errors.some((e) => e.code === TierValidationErrorCode.DUPLICATE_SORT_ORDER)).toBe(true);
    });

    it('rejects inconsistent currency when expected currency is set', () => {
      const errors = validateTierSchedule(
        [{ minVehicles: 1, maxVehicles: null, unitPriceCents: 100, sortOrder: 0, currency: 'USD' }],
        { currency: 'EUR' },
      );
      expect(errors.some((e) => e.code === TierValidationErrorCode.CURRENCY_INCONSISTENT)).toBe(true);
    });
  });

  describe('calculateTierPricing — quantity boundaries', () => {
    it('returns NO_BILLABLE_VEHICLES for quantity 0', () => {
      const result = calculateTierPricing({ quantity: 0, tiers: sampleTiers });
      expect(result.calculationStatus).toBe(BillingUsageCalculationStatus.NO_BILLABLE_VEHICLES);
      expect(result.totalQuantity).toBe(0);
      expect(result.tierLines).toHaveLength(0);
    });

    it('calculates quantity 1 at first tier (volume)', () => {
      const result = calculateTierPricing({ quantity: 1, tiers: sampleTiers });
      expect(result.calculationStatus).toBe(BillingUsageCalculationStatus.OK);
      expect(result.pricingModel).toBe(PricingModel.VOLUME);
      expect(result.unitPriceCents).toBe(1000);
      expect(result.totalCents).toBe(1000);
      expect(result.tierLines).toEqual([
        expect.objectContaining({ quantity: 1, unitPriceCents: 1000, subtotalCents: 1000 }),
      ]);
    });

    it.each([
      [8, 1000, 8000],
      [9, 900, 8100],
      [19, 900, 17100],
      [20, 800, 16000],
      [21, 800, 16800],
    ])('volume pricing at tier boundary quantity %i', (quantity, unitPrice, total) => {
      const result = calculateTierPricing({ quantity, tiers: sampleTiers });
      expect(result.unitPriceCents).toBe(unitPrice);
      expect(result.totalCents).toBe(total);
      expect(result.tierLines[0].quantity).toBe(quantity);
    });

    it('uses unlimited last tier for large quantity', () => {
      const result = calculateTierPricing({ quantity: 50_000, tiers: sampleTiers });
      expect(result.calculationStatus).toBe(BillingUsageCalculationStatus.OK);
      expect(result.unitPriceCents).toBe(800);
      expect(result.totalCents).toBe(50_000 * 800);
    });
  });

  describe('calculateTierPricing — volume vs graduated', () => {
    it('volume: entire quantity at matched tier unit price', () => {
      const result = calculateTierPricing({
        quantity: 12,
        tiers: sampleTiers,
        pricingModel: PricingModel.VOLUME,
      });
      expect(result.pricingModel).toBe(PricingModel.VOLUME);
      expect(result.unitPriceCents).toBe(900);
      expect(result.subtotalCents).toBe(12 * 900);
      expect(result.tierLines).toHaveLength(1);
      expect(result.tierLines[0]).toMatchObject({
        quantity: 12,
        unitPriceCents: 900,
        subtotalCents: 12 * 900,
      });
    });

    it('graduated: allocates quantity proportionally across tiers', () => {
      const result = calculateTierPricing({
        quantity: 12,
        tiers: sampleTiers,
        pricingModel: BillingTierMode.GRADUATED,
      });
      expect(result.pricingModel).toBe(PricingModel.GRADUATED);
      expect(result.tierLines).toHaveLength(2);
      expect(result.tierLines[0]).toMatchObject({
        quantity: 8,
        unitPriceCents: 1000,
        subtotalCents: 8000,
      });
      expect(result.tierLines[1]).toMatchObject({
        quantity: 4,
        unitPriceCents: 900,
        subtotalCents: 3600,
      });
      expect(result.subtotalCents).toBe(11_600);
      expect(result.totalCents).toBe(11_600);
      expect(result.unitPriceCents).toBe(Math.round(11_600 / 12));
    });

    it('graduated at single-tier schedule uses one line', () => {
      const result = calculateTierPricing({
        quantity: 5,
        tiers: [{ minVehicles: 1, maxVehicles: null, unitPriceCents: 500, sortOrder: 0 }],
        pricingModel: PricingModel.GRADUATED,
      });
      expect(result.tierLines).toHaveLength(1);
      expect(result.totalCents).toBe(2500);
    });
  });

  describe('calculateTierPricing — minor-unit rounding', () => {
    it('rounds graduated weighted average unit price to nearest cent', () => {
      const tiers: TierScheduleTier[] = [
        { minVehicles: 1, maxVehicles: 1, unitPriceCents: 100, sortOrder: 0 },
        { minVehicles: 2, maxVehicles: null, unitPriceCents: 101, sortOrder: 1 },
      ];
      const result = calculateTierPricing({
        quantity: 2,
        tiers,
        pricingModel: PricingModel.GRADUATED,
      });
      expect(result.subtotalCents).toBe(201);
      expect(result.unitPriceCents).toBe(101);
    });

    it('rounds weighted average when subtotal does not divide evenly', () => {
      const tiers: TierScheduleTier[] = [
        { minVehicles: 1, maxVehicles: 2, unitPriceCents: 100, sortOrder: 0 },
        { minVehicles: 3, maxVehicles: null, unitPriceCents: 101, sortOrder: 1 },
      ];
      const result = calculateTierPricing({
        quantity: 3,
        tiers,
        pricingModel: PricingModel.GRADUATED,
      });
      expect(result.subtotalCents).toBe(301);
      expect(result.unitPriceCents).toBe(100);
    });
  });

  describe('calculateTierPricing — invalid schedule', () => {
    it('returns PRICE_NOT_CONFIGURED when schedule has gap', () => {
      const result = calculateTierPricing({
        quantity: 5,
        tiers: [
          { minVehicles: 1, maxVehicles: 3, unitPriceCents: 100, sortOrder: 0 },
          { minVehicles: 5, maxVehicles: null, unitPriceCents: 90, sortOrder: 1 },
        ],
      });
      expect(result.calculationStatus).toBe(BillingUsageCalculationStatus.PRICE_NOT_CONFIGURED);
      expect(result.tierLines).toHaveLength(0);
    });

    it('returns PRICE_NOT_CONFIGURED when unit price is null', () => {
      const result = calculateTierPricing({
        quantity: 3,
        tiers: [{ minVehicles: 1, maxVehicles: null, unitPriceCents: null, sortOrder: 0 }],
      });
      expect(result.calculationStatus).toBe(BillingUsageCalculationStatus.PRICE_NOT_CONFIGURED);
    });
  });
});
