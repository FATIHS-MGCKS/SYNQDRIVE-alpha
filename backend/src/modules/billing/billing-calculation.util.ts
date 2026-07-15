import { BillingTierMode, BillingUsageCalculationStatus } from '@prisma/client';
import {
  calculateTierPricing,
  mapBillingTierModeToPricingModel,
  resolveTierForQuantity,
  sortTiersForSchedule,
  TierScheduleTier,
  TierValidationError,
  TierValidationErrorCode,
  validateTierSchedule,
} from './domain/tier-pricing-calculator';
import { PricingModel } from './domain/billing-domain.types';

export interface PriceTierInput {
  id?: string;
  minVehicles: number;
  maxVehicles: number | null;
  unitPriceCents: number | null;
  sortOrder?: number;
}

export interface TierValidationErrorLegacy {
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
  pricingModel: typeof PricingModel.VOLUME | typeof PricingModel.GRADUATED;
  tierLines: ReturnType<typeof calculateTierPricing>['tierLines'];
}

function toScheduleTier(tier: PriceTierInput): TierScheduleTier {
  return {
    id: tier.id,
    minVehicles: tier.minVehicles,
    maxVehicles: tier.maxVehicles,
    unitPriceCents: tier.unitPriceCents,
    sortOrder: tier.sortOrder,
  };
}

function mapValidationError(error: TierValidationError): TierValidationErrorLegacy {
  return {
    code: error.code,
    message: error.code,
    tierIndex: error.tierIndex,
  };
}

export function validateTierRow(
  tier: PriceTierInput,
  index: number,
): TierValidationErrorLegacy | null {
  if (tier.minVehicles <= 0) {
    return { code: TierValidationErrorCode.MIN_VEHICLES_INVALID, message: TierValidationErrorCode.MIN_VEHICLES_INVALID, tierIndex: index };
  }
  if (tier.maxVehicles != null && tier.maxVehicles < tier.minVehicles) {
    return { code: TierValidationErrorCode.MAX_BELOW_MIN, message: TierValidationErrorCode.MAX_BELOW_MIN, tierIndex: index };
  }
  if (tier.unitPriceCents != null && tier.unitPriceCents < 0) {
    return { code: TierValidationErrorCode.NEGATIVE_UNIT_PRICE, message: TierValidationErrorCode.NEGATIVE_UNIT_PRICE, tierIndex: index };
  }
  return null;
}

export function tiersOverlap(a: PriceTierInput, b: PriceTierInput): boolean {
  const aMax = a.maxVehicles ?? Number.POSITIVE_INFINITY;
  const bMax = b.maxVehicles ?? Number.POSITIVE_INFINITY;
  return a.minVehicles <= bMax && b.minVehicles <= aMax;
}

export function validateTiersNoOverlap(
  tiers: PriceTierInput[],
  opts?: { currency?: string | null },
): TierValidationErrorLegacy[] {
  return validateTierSchedule(tiers.map(toScheduleTier), opts).map(mapValidationError);
}

export function resolveTierForVehicleCount(
  vehicleCount: number,
  tiers: PriceTierInput[],
): PriceTierInput | null {
  const matched = resolveTierForQuantity(vehicleCount, tiers.map(toScheduleTier));
  if (!matched) return null;
  return {
    id: matched.id,
    minVehicles: matched.minVehicles,
    maxVehicles: matched.maxVehicles,
    unitPriceCents: matched.unitPriceCents,
    sortOrder: matched.sortOrder,
  };
}

export function calculateVolumePricing(input: VolumePricingInput): VolumePricingResult {
  const result = calculateTierPricing({
    quantity: input.vehicleCount,
    tiers: input.tiers.map(toScheduleTier),
    pricingModel: mapBillingTierModeToPricingModel(input.tierMode),
    currency: input.currency ?? null,
    customUnitPriceCents: input.customUnitPriceCents,
    customMonthlyMinimumCents: input.customMonthlyMinimumCents,
  });

  const matchedTier = result.matchedTier
    ? {
        id: result.matchedTier.id,
        minVehicles: result.matchedTier.minVehicles,
        maxVehicles: result.matchedTier.maxVehicles,
        unitPriceCents: result.matchedTier.unitPriceCents,
        sortOrder: result.matchedTier.sortOrder,
      }
    : result.tierLines.length === 1
      ? {
          id: result.tierLines[0].tierId ?? undefined,
          minVehicles: result.tierLines[0].minVehicles,
          maxVehicles: result.tierLines[0].maxVehicles,
          unitPriceCents: result.tierLines[0].unitPriceCents,
          sortOrder: result.tierLines[0].sortOrder,
        }
      : null;

  return {
    calculationStatus: result.calculationStatus,
    tier: matchedTier,
    unitPriceCents: result.unitPriceCents,
    subtotalCents: result.subtotalCents,
    totalCents: result.totalCents,
    pricingModel: result.pricingModel,
    tierLines: result.tierLines,
  };
}

export {
  calculateTierPricing,
  mapBillingTierModeToPricingModel,
  resolveTierForQuantity,
  sortTiersForSchedule,
  TierValidationErrorCode,
  validateTierSchedule,
};
