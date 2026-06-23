import { BillingTierMode, BillingUsageCalculationStatus } from '@prisma/client';

export interface PriceTierInput {
  id?: string;
  minVehicles: number;
  maxVehicles: number | null;
  unitPriceCents: number | null;
  sortOrder?: number;
}

export interface TierValidationError {
  code: string;
  message: string;
  tierIndex?: number;
}

export interface VolumePricingInput {
  vehicleCount: number;
  tiers: PriceTierInput[];
  tierMode?: BillingTierMode;
  customUnitPriceCents?: number | null;
  customMonthlyMinimumCents?: number | null;
  currency?: string;
}

export interface VolumePricingResult {
  calculationStatus: BillingUsageCalculationStatus;
  tier: PriceTierInput | null;
  unitPriceCents: number | null;
  subtotalCents: number | null;
  totalCents: number | null;
}

/**
 * Validate a single tier row.
 */
export function validateTierRow(
  tier: PriceTierInput,
  index: number,
): TierValidationError | null {
  if (tier.minVehicles <= 0) {
    return {
      code: 'MIN_VEHICLES_INVALID',
      message: `Tier ${index + 1}: minVehicles must be > 0`,
      tierIndex: index,
    };
  }
  if (tier.maxVehicles != null && tier.maxVehicles < tier.minVehicles) {
    return {
      code: 'MAX_BELOW_MIN',
      message: `Tier ${index + 1}: maxVehicles must be >= minVehicles`,
      tierIndex: index,
    };
  }
  return null;
}

/**
 * Returns true when two tier ranges overlap (inclusive bounds).
 */
export function tiersOverlap(a: PriceTierInput, b: PriceTierInput): boolean {
  const aMax = a.maxVehicles ?? Number.POSITIVE_INFINITY;
  const bMax = b.maxVehicles ?? Number.POSITIVE_INFINITY;
  return a.minVehicles <= bMax && b.minVehicles <= aMax;
}

/**
 * Validate that tiers do not overlap within a version.
 */
export function validateTiersNoOverlap(tiers: PriceTierInput[]): TierValidationError[] {
  const errors: TierValidationError[] = [];
  const sorted = [...tiers].sort((x, y) => x.minVehicles - y.minVehicles);

  for (let i = 0; i < sorted.length; i++) {
    const rowError = validateTierRow(sorted[i], i);
    if (rowError) errors.push(rowError);
  }

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (tiersOverlap(sorted[i], sorted[j])) {
        errors.push({
          code: 'TIERS_OVERLAP',
          message: `Tiers ${i + 1} and ${j + 1} overlap (${sorted[i].minVehicles}–${sorted[i].maxVehicles ?? '∞'} vs ${sorted[j].minVehicles}–${sorted[j].maxVehicles ?? '∞'})`,
          tierIndex: j,
        });
      }
    }
  }

  return errors;
}

/**
 * Resolve the applicable tier for a vehicle count (VOLUME mode).
 * The entire fleet is priced at the matching tier's unit price.
 */
export function resolveTierForVehicleCount(
  vehicleCount: number,
  tiers: PriceTierInput[],
): PriceTierInput | null {
  if (vehicleCount <= 0 || tiers.length === 0) return null;

  const sorted = [...tiers].sort((a, b) => {
    const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return a.minVehicles - b.minVehicles;
  });

  for (const tier of sorted) {
    const withinMin = vehicleCount >= tier.minVehicles;
    const withinMax = tier.maxVehicles == null || vehicleCount <= tier.maxVehicles;
    if (withinMin && withinMax) return tier;
  }

  return null;
}

/**
 * VOLUME pricing: billableCount × unitPrice (optionally overridden).
 * GRADUATED is reserved for future use — currently falls back to VOLUME behaviour.
 */
export function calculateVolumePricing(input: VolumePricingInput): VolumePricingResult {
  const { vehicleCount, tiers, customUnitPriceCents, customMonthlyMinimumCents } = input;

  if (vehicleCount <= 0) {
    return {
      calculationStatus: BillingUsageCalculationStatus.NO_BILLABLE_VEHICLES,
      tier: null,
      unitPriceCents: null,
      subtotalCents: null,
      totalCents: null,
    };
  }

  const tier = resolveTierForVehicleCount(vehicleCount, tiers);
  if (!tier) {
    return {
      calculationStatus: BillingUsageCalculationStatus.PRICE_NOT_CONFIGURED,
      tier: null,
      unitPriceCents: null,
      subtotalCents: null,
      totalCents: null,
    };
  }

  const unitPriceCents =
    customUnitPriceCents != null ? customUnitPriceCents : tier.unitPriceCents;

  if (unitPriceCents == null) {
    return {
      calculationStatus: BillingUsageCalculationStatus.PRICE_NOT_CONFIGURED,
      tier,
      unitPriceCents: null,
      subtotalCents: null,
      totalCents: null,
    };
  }

  let subtotalCents = vehicleCount * unitPriceCents;
  if (customMonthlyMinimumCents != null && subtotalCents < customMonthlyMinimumCents) {
    subtotalCents = customMonthlyMinimumCents;
  }

  return {
    calculationStatus: BillingUsageCalculationStatus.OK,
    tier,
    unitPriceCents,
    subtotalCents,
    totalCents: subtotalCents,
  };
}
