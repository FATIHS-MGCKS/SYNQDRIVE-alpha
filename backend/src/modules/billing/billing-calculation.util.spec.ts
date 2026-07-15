import {
  BillingTierMode,
  BillingUsageCalculationStatus,
} from '@prisma/client';
import { PricingModel } from './domain/billing-domain.types';
import {
  calculateVolumePricing,
  PriceTierInput,
  resolveTierForVehicleCount,
  validateTierRow,
  validateTiersNoOverlap,
} from './billing-calculation.util';

describe('billing-calculation.util', () => {
  const sampleTiers: PriceTierInput[] = [
    { minVehicles: 1, maxVehicles: 8, unitPriceCents: 1000, sortOrder: 0 },
    { minVehicles: 9, maxVehicles: 19, unitPriceCents: 900, sortOrder: 1 },
    { minVehicles: 20, maxVehicles: null, unitPriceCents: 800, sortOrder: 2 },
  ];

  describe('resolveTierForVehicleCount (VOLUME)', () => {
    it.each([
      [1, 1, 8],
      [8, 1, 8],
      [9, 9, 19],
      [19, 9, 19],
      [20, 20, null],
      [21, 20, null],
    ])('resolves %i vehicles to tier %i–%s', (count, min, max) => {
      const tier = resolveTierForVehicleCount(count, sampleTiers);
      expect(tier).not.toBeNull();
      expect(tier!.minVehicles).toBe(min);
      expect(tier!.maxVehicles).toBe(max);
    });

    it('returns null when count is 0', () => {
      expect(resolveTierForVehicleCount(0, sampleTiers)).toBeNull();
    });
  });

  describe('validateTiersNoOverlap', () => {
    it('accepts non-overlapping tiers', () => {
      expect(validateTiersNoOverlap(sampleTiers)).toHaveLength(0);
    });

    it('rejects overlapping tiers', () => {
      const overlapping: PriceTierInput[] = [
        { minVehicles: 1, maxVehicles: 10, unitPriceCents: 1000 },
        { minVehicles: 8, maxVehicles: 20, unitPriceCents: 900 },
      ];
      const errors = validateTiersNoOverlap(overlapping);
      expect(errors.some((e) => e.code === 'TIERS_OVERLAP')).toBe(true);
    });

    it('rejects gaps between tiers', () => {
      const gapped: PriceTierInput[] = [
        { minVehicles: 1, maxVehicles: 5, unitPriceCents: 1000 },
        { minVehicles: 7, maxVehicles: null, unitPriceCents: 900 },
      ];
      const errors = validateTiersNoOverlap(gapped);
      expect(errors.some((e) => e.code === 'TIER_GAP')).toBe(true);
    });

    it('rejects schedule not starting at 1', () => {
      const errors = validateTiersNoOverlap([
        { minVehicles: 2, maxVehicles: 10, unitPriceCents: 1000 },
      ]);
      expect(errors.some((e) => e.code === 'FIRST_TIER_NOT_ONE')).toBe(true);
    });

    it('rejects minVehicles <= 0', () => {
      expect(validateTierRow({ minVehicles: 0, maxVehicles: 5, unitPriceCents: 100 }, 0)).toMatchObject({
        code: 'MIN_VEHICLES_INVALID',
      });
    });

    it('rejects maxVehicles below minVehicles', () => {
      expect(validateTierRow({ minVehicles: 5, maxVehicles: 3, unitPriceCents: 100 }, 0)).toMatchObject({
        code: 'MAX_BELOW_MIN',
      });
    });
  });

  describe('calculateVolumePricing', () => {
    it('calculates 12 vehicles at tier 9–19 (900 cents each)', () => {
      const result = calculateVolumePricing({ vehicleCount: 12, tiers: sampleTiers });
      expect(result.calculationStatus).toBe(BillingUsageCalculationStatus.OK);
      expect(result.unitPriceCents).toBe(900);
      expect(result.subtotalCents).toBe(12 * 900);
      expect(result.totalCents).toBe(12 * 900);
    });

    it('returns PRICE_NOT_CONFIGURED when unit price is null', () => {
      const tiers: PriceTierInput[] = [
        { minVehicles: 1, maxVehicles: null, unitPriceCents: null },
      ];
      const result = calculateVolumePricing({ vehicleCount: 5, tiers });
      expect(result.calculationStatus).toBe(BillingUsageCalculationStatus.PRICE_NOT_CONFIGURED);
      expect(result.subtotalCents).toBeNull();
    });

    it('returns NO_BILLABLE_VEHICLES when count is 0', () => {
      const result = calculateVolumePricing({ vehicleCount: 0, tiers: sampleTiers });
      expect(result.calculationStatus).toBe(BillingUsageCalculationStatus.NO_BILLABLE_VEHICLES);
    });

    it('returns PRICE_NOT_CONFIGURED when quantity exceeds capped last tier', () => {
      const tiers: PriceTierInput[] = [
        { minVehicles: 1, maxVehicles: 5, unitPriceCents: 500 },
      ];
      const result = calculateVolumePricing({ vehicleCount: 10, tiers });
      expect(result.calculationStatus).toBe(BillingUsageCalculationStatus.PRICE_NOT_CONFIGURED);
    });

    it('calculates graduated pricing with tier lines', () => {
      const result = calculateVolumePricing({
        vehicleCount: 12,
        tiers: sampleTiers,
        tierMode: BillingTierMode.GRADUATED,
      });
      expect(result.pricingModel).toBe(PricingModel.GRADUATED);
      expect(result.calculationStatus).toBe(BillingUsageCalculationStatus.OK);
      expect(result.subtotalCents).toBe(11_600);
      expect(result.tierLines).toHaveLength(2);
    });

    it('applies org custom unit price override', () => {
      const result = calculateVolumePricing({
        vehicleCount: 5,
        tiers: sampleTiers,
        customUnitPriceCents: 750,
      });
      expect(result.calculationStatus).toBe(BillingUsageCalculationStatus.OK);
      expect(result.unitPriceCents).toBe(750);
      expect(result.subtotalCents).toBe(5 * 750);
    });

    it('applies monthly minimum when subtotal is lower', () => {
      const result = calculateVolumePricing({
        vehicleCount: 2,
        tiers: sampleTiers,
        customMonthlyMinimumCents: 5000,
      });
      expect(result.subtotalCents).toBe(5000);
    });

    it('historical snapshot values are independent of later tier changes', () => {
      const frozen = calculateVolumePricing({ vehicleCount: 8, tiers: sampleTiers });
      const laterTiers: PriceTierInput[] = [
        { minVehicles: 1, maxVehicles: 8, unitPriceCents: 2000, sortOrder: 0 },
      ];
      const recalculated = calculateVolumePricing({ vehicleCount: 8, tiers: laterTiers });
      expect(frozen.subtotalCents).toBe(8 * 1000);
      expect(recalculated.subtotalCents).toBe(8 * 2000);
      expect(frozen.subtotalCents).not.toBe(recalculated.subtotalCents);
    });
  });
});
