import type { PriceOptionPricingType } from '@prisma/client';

/** Internal resolver output — enriched before mapping to PricingContextDto. */
export interface ResolvedTariffContext {
  assignmentId: string;
  vehicleId: string;
  pickupAt: Date;
  priceBook: {
    id: string;
    name?: string;
    currency: string;
    taxRatePercent: number;
  };
  tariffGroup: {
    id: string;
    name: string;
    category: string | null;
    isActive: boolean;
  };
  tariffVersion: {
    id: string;
    versionNumber: number;
    validFrom: Date;
    validTo: Date | null;
    rate: {
      id: string;
      dailyRateCents: number;
      weeklyRateCents: number;
      monthlyRateCents: number;
      includedKmPerDay: number;
      extraKmPriceCents: number;
      depositAmountCents: number;
      minimumRentalDays: number | null;
    };
    mileagePackages: PricingContextMileagePackage[];
    insuranceOptions: PricingContextInsuranceOption[];
    extraOptions: PricingContextExtraOption[];
  };
}

/** Canonical server-resolved pricing context — single source for simulation and booking. */
export interface PricingContextDto {
  priceBookId: string;
  priceBookName?: string;
  currency: string;
  assignmentId: string;
  tariffGroupId: string;
  tariffGroupName: string;
  tariffVersionId: string;
  versionNumber: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  vehicleId: string;
  pickupAt: string;
  depositAmountCents: number;
  resolvedDeposit?: {
    amount: number;
    currency: string;
    source: string;
    ruleRevisionId: string | null;
    reason: string;
    manualOverride: boolean;
    calculatedAt: string;
  };
  taxRatePercent: number;
  mileagePackages: PricingContextMileagePackage[];
  insuranceOptions: PricingContextInsuranceOption[];
  extraOptions: PricingContextExtraOption[];
  rate: PricingContextRate;
}

export interface PricingContextRate {
  dailyRateCents: number;
  weeklyRateCents: number;
  monthlyRateCents: number;
  includedKmPerDay: number;
  extraKmPriceCents: number;
  minimumRentalDays: number | null;
}

export interface PricingContextMileagePackage {
  id: string;
  label: string;
  includedKm: number;
  priceCents: number;
  isActive: boolean;
  sortOrder: number;
}

export interface PricingContextInsuranceOption {
  id: string;
  label: string;
  description?: string | null;
  priceCents: number;
  pricingType: PriceOptionPricingType;
  deductibleCents?: number | null;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface PricingContextExtraOption {
  id: string;
  label: string;
  description?: string | null;
  priceCents: number;
  pricingType: PriceOptionPricingType;
  isActive: boolean;
  sortOrder: number;
}

export type PricingContextErrorCode =
  | 'NO_ACTIVE_TARIFF'
  | 'ASSIGNMENT_CONFLICT'
  | 'TARIFF_GROUP_INACTIVE'
  | 'NO_TARIFF_VERSION_FOR_PICKUP'
  | 'TARIFF_RESOLUTION_AMBIGUOUS'
  | 'NO_TARIFF_RATE_FOR_PICKUP'
  | 'PRICE_BOOK_INACTIVE'
  | 'PRICE_BOOK_CURRENCY_MISSING'
  | 'CURRENCY_MISMATCH'
  | 'TARIFF_VERSION_INCOMPLETE';
