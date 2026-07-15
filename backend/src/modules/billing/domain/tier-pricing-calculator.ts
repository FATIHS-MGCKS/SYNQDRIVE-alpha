import { BillingTierMode, BillingUsageCalculationStatus } from '@prisma/client';
import { PricingModel } from './billing-domain.types';

export type TierPricingModel = typeof PricingModel.VOLUME | typeof PricingModel.GRADUATED;

export interface TierScheduleTier {
  id?: string;
  minVehicles: number;
  maxVehicles: number | null;
  unitPriceCents: number | null;
  sortOrder?: number;
  currency?: string | null;
}

export const TierValidationErrorCode = {
  TIER_SCHEDULE_EMPTY: 'TIER_SCHEDULE_EMPTY',
  FIRST_TIER_NOT_ONE: 'FIRST_TIER_NOT_ONE',
  MIN_VEHICLES_INVALID: 'MIN_VEHICLES_INVALID',
  MAX_BELOW_MIN: 'MAX_BELOW_MIN',
  TIER_GAP: 'TIER_GAP',
  TIERS_OVERLAP: 'TIERS_OVERLAP',
  UNLIMITED_NOT_LAST: 'UNLIMITED_NOT_LAST',
  MULTIPLE_UNLIMITED_TIERS: 'MULTIPLE_UNLIMITED_TIERS',
  NEGATIVE_UNIT_PRICE: 'NEGATIVE_UNIT_PRICE',
  DUPLICATE_SORT_ORDER: 'DUPLICATE_SORT_ORDER',
  CURRENCY_INCONSISTENT: 'CURRENCY_INCONSISTENT',
} as const;

export type TierValidationErrorCode =
  (typeof TierValidationErrorCode)[keyof typeof TierValidationErrorCode];

export interface TierValidationError {
  code: TierValidationErrorCode;
  tierIndex?: number;
  relatedTierIndex?: number;
}

export interface TierPricingLine {
  tierId: string | null;
  minVehicles: number;
  maxVehicles: number | null;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
  sortOrder: number;
}

export interface TierPricingCalculatorInput {
  quantity: number;
  tiers: TierScheduleTier[];
  pricingModel?: TierPricingModel | BillingTierMode;
  currency?: string | null;
  customUnitPriceCents?: number | null;
  customMonthlyMinimumCents?: number | null;
}

export interface TierPricingCalculatorResult {
  calculationStatus: BillingUsageCalculationStatus;
  pricingModel: TierPricingModel;
  totalQuantity: number;
  currency: string | null;
  tierLines: TierPricingLine[];
  /** Volume: matched tier unit price. Graduated: weighted average unit price when quantity > 0. */
  unitPriceCents: number | null;
  subtotalCents: number | null;
  totalCents: number | null;
  matchedTier: TierScheduleTier | null;
}

export function mapBillingTierModeToPricingModel(
  mode: BillingTierMode | TierPricingModel | undefined | null,
): TierPricingModel {
  if (mode === 'GRADUATED') {
    return PricingModel.GRADUATED;
  }
  return PricingModel.VOLUME;
}

export function sortTiersForSchedule(tiers: TierScheduleTier[]): TierScheduleTier[] {
  return [...tiers].sort((a, b) => {
    const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return a.minVehicles - b.minVehicles;
  });
}

export function validateTierSchedule(
  tiers: TierScheduleTier[],
  opts?: { currency?: string | null },
): TierValidationError[] {
  const errors: TierValidationError[] = [];

  if (tiers.length === 0) {
    errors.push({ code: TierValidationErrorCode.TIER_SCHEDULE_EMPTY });
    return errors;
  }

  const expectedCurrency = opts?.currency?.trim().toUpperCase() ?? null;
  const sortOrders = new Set<number>();

  for (let index = 0; index < tiers.length; index++) {
    const tier = tiers[index];

    if (tier.minVehicles <= 0) {
      errors.push({ code: TierValidationErrorCode.MIN_VEHICLES_INVALID, tierIndex: index });
    }
    if (tier.maxVehicles != null && tier.maxVehicles < tier.minVehicles) {
      errors.push({ code: TierValidationErrorCode.MAX_BELOW_MIN, tierIndex: index });
    }
    if (tier.unitPriceCents != null && tier.unitPriceCents < 0) {
      errors.push({ code: TierValidationErrorCode.NEGATIVE_UNIT_PRICE, tierIndex: index });
    }

    const sortOrder = tier.sortOrder ?? index;
    if (sortOrders.has(sortOrder)) {
      errors.push({ code: TierValidationErrorCode.DUPLICATE_SORT_ORDER, tierIndex: index });
    }
    sortOrders.add(sortOrder);

    if (tier.currency != null && expectedCurrency != null) {
      if (tier.currency.trim().toUpperCase() !== expectedCurrency) {
        errors.push({ code: TierValidationErrorCode.CURRENCY_INCONSISTENT, tierIndex: index });
      }
    }
  }

  const sorted = [...tiers].sort((a, b) => a.minVehicles - b.minVehicles);

  if (sorted[0].minVehicles !== 1) {
    errors.push({ code: TierValidationErrorCode.FIRST_TIER_NOT_ONE, tierIndex: tiers.indexOf(sorted[0]) });
  }

  let unlimitedCount = 0;
  for (let index = 0; index < sorted.length; index++) {
    const tier = sorted[index];
    const isLast = index === sorted.length - 1;

    if (tier.maxVehicles == null) {
      unlimitedCount += 1;
      if (!isLast) {
        errors.push({
          code: TierValidationErrorCode.UNLIMITED_NOT_LAST,
          tierIndex: tiers.indexOf(tier),
        });
      }
      if (index > 0) {
        const previous = sorted[index - 1];
        if (previous.maxVehicles != null) {
          if (tier.minVehicles !== previous.maxVehicles + 1) {
            if (tier.minVehicles <= previous.maxVehicles) {
              errors.push({
                code: TierValidationErrorCode.TIERS_OVERLAP,
                tierIndex: tiers.indexOf(tier),
                relatedTierIndex: tiers.indexOf(previous),
              });
            } else {
              errors.push({
                code: TierValidationErrorCode.TIER_GAP,
                tierIndex: tiers.indexOf(tier),
                relatedTierIndex: tiers.indexOf(previous),
              });
            }
          }
        }
      }
      continue;
    }

    if (index > 0) {
      const previous = sorted[index - 1];
      if (previous.maxVehicles == null) {
        errors.push({
          code: TierValidationErrorCode.MULTIPLE_UNLIMITED_TIERS,
          tierIndex: tiers.indexOf(tier),
          relatedTierIndex: tiers.indexOf(previous),
        });
      } else if (tier.minVehicles !== previous.maxVehicles + 1) {
        if (tier.minVehicles <= previous.maxVehicles) {
          errors.push({
            code: TierValidationErrorCode.TIERS_OVERLAP,
            tierIndex: tiers.indexOf(tier),
            relatedTierIndex: tiers.indexOf(previous),
          });
        } else {
          errors.push({
            code: TierValidationErrorCode.TIER_GAP,
            tierIndex: tiers.indexOf(tier),
            relatedTierIndex: tiers.indexOf(previous),
          });
        }
      }
    }
  }

  if (unlimitedCount > 1) {
    errors.push({ code: TierValidationErrorCode.MULTIPLE_UNLIMITED_TIERS });
  }

  return errors;
}

export function resolveTierForQuantity(
  quantity: number,
  tiers: TierScheduleTier[],
): TierScheduleTier | null {
  if (quantity <= 0 || tiers.length === 0) return null;

  const sorted = sortTiersForSchedule(tiers);
  for (const tier of sorted) {
    const withinMin = quantity >= tier.minVehicles;
    const withinMax = tier.maxVehicles == null || quantity <= tier.maxVehicles;
    if (withinMin && withinMax) return tier;
  }

  return null;
}

function allocateGraduatedLines(
  quantity: number,
  tiers: TierScheduleTier[],
): TierPricingLine[] {
  const sorted = [...tiers].sort((a, b) => a.minVehicles - b.minVehicles);
  const lines: TierPricingLine[] = [];

  for (const tier of sorted) {
    const rangeStart = tier.minVehicles;
    const rangeEnd = tier.maxVehicles ?? Number.POSITIVE_INFINITY;
    const overlapStart = Math.max(rangeStart, 1);
    const overlapEnd = Math.min(rangeEnd, quantity);
    if (overlapEnd < overlapStart || quantity < rangeStart) continue;

    const unitsInTier = overlapEnd - overlapStart + 1;
    const unitPriceCents = tier.unitPriceCents ?? 0;

    lines.push({
      tierId: tier.id ?? null,
      minVehicles: tier.minVehicles,
      maxVehicles: tier.maxVehicles,
      quantity: unitsInTier,
      unitPriceCents,
      subtotalCents: unitsInTier * unitPriceCents,
      sortOrder: tier.sortOrder ?? 0,
    });
  }

  return lines;
}

function applyMonthlyMinimum(
  subtotalCents: number,
  customMonthlyMinimumCents: number | null | undefined,
): number {
  if (customMonthlyMinimumCents != null && subtotalCents < customMonthlyMinimumCents) {
    return customMonthlyMinimumCents;
  }
  return subtotalCents;
}

function weightedAverageUnitPrice(
  totalQuantity: number,
  subtotalCents: number,
): number | null {
  if (totalQuantity <= 0) return null;
  return Math.round(subtotalCents / totalQuantity);
}

export function calculateTierPricing(
  input: TierPricingCalculatorInput,
): TierPricingCalculatorResult {
  const pricingModel = mapBillingTierModeToPricingModel(input.pricingModel);
  const currency = input.currency?.trim().toUpperCase() ?? null;
  const emptyBase: TierPricingCalculatorResult = {
    calculationStatus: BillingUsageCalculationStatus.PRICE_NOT_CONFIGURED,
    pricingModel,
    totalQuantity: input.quantity,
    currency,
    tierLines: [],
    unitPriceCents: null,
    subtotalCents: null,
    totalCents: null,
    matchedTier: null,
  };

  if (input.quantity <= 0) {
    return {
      ...emptyBase,
      calculationStatus: BillingUsageCalculationStatus.NO_BILLABLE_VEHICLES,
    };
  }

  if (input.tiers.length === 0) {
    return emptyBase;
  }

  const scheduleErrors = validateTierSchedule(input.tiers, { currency });
  if (scheduleErrors.length > 0) {
    return emptyBase;
  }

  if (pricingModel === PricingModel.VOLUME) {
    const matchedTier = resolveTierForQuantity(input.quantity, input.tiers);
    if (!matchedTier) {
      return emptyBase;
    }

    const unitPriceCents =
      input.customUnitPriceCents != null
        ? input.customUnitPriceCents
        : matchedTier.unitPriceCents;

    if (unitPriceCents == null) {
      return {
        ...emptyBase,
        matchedTier,
        calculationStatus: BillingUsageCalculationStatus.PRICE_NOT_CONFIGURED,
      };
    }

    const rawSubtotal = input.quantity * unitPriceCents;
    const subtotalCents = applyMonthlyMinimum(rawSubtotal, input.customMonthlyMinimumCents);

    return {
      calculationStatus: BillingUsageCalculationStatus.OK,
      pricingModel,
      totalQuantity: input.quantity,
      currency,
      tierLines: [
        {
          tierId: matchedTier.id ?? null,
          minVehicles: matchedTier.minVehicles,
          maxVehicles: matchedTier.maxVehicles,
          quantity: input.quantity,
          unitPriceCents,
          subtotalCents: rawSubtotal,
          sortOrder: matchedTier.sortOrder ?? 0,
        },
      ],
      unitPriceCents,
      subtotalCents,
      totalCents: subtotalCents,
      matchedTier,
    };
  }

  const lines = allocateGraduatedLines(input.quantity, input.tiers);
  if (lines.length === 0) {
    return emptyBase;
  }

  if (lines.some((line) => line.unitPriceCents == null)) {
    return {
      ...emptyBase,
      tierLines: lines,
      calculationStatus: BillingUsageCalculationStatus.PRICE_NOT_CONFIGURED,
    };
  }

  const rawSubtotal = lines.reduce((sum, line) => sum + line.subtotalCents, 0);
  const subtotalCents = applyMonthlyMinimum(rawSubtotal, input.customMonthlyMinimumCents);
  const unitPriceCents = weightedAverageUnitPrice(input.quantity, rawSubtotal);

  return {
    calculationStatus: BillingUsageCalculationStatus.OK,
    pricingModel,
    totalQuantity: input.quantity,
    currency,
    tierLines: lines,
    unitPriceCents,
    subtotalCents,
    totalCents: subtotalCents,
    matchedTier: lines.length === 1 ? input.tiers.find((t) => t.id === lines[0].tierId) ?? null : null,
  };
}
