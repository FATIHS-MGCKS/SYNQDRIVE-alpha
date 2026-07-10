export type TariffVersionStatus = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'ARCHIVED';
export type PriceOptionPricingType = 'PER_DAY' | 'PER_BOOKING';

export interface TariffRate {
  id: string;
  dailyRateCents: number;
  weeklyRateCents: number;
  monthlyRateCents: number;
  includedKmPerDay: number;
  extraKmPriceCents: number;
  depositAmountCents: number;
  minimumRentalDays?: number | null;
}

export interface MileagePackageOption {
  id: string;
  label: string;
  includedKm: number;
  priceCents: number;
  isActive: boolean;
  sortOrder: number;
}

export interface InsuranceOptionRow {
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

export interface ExtraOptionRow {
  id: string;
  label: string;
  description?: string | null;
  priceCents: number;
  pricingType: PriceOptionPricingType;
  isActive: boolean;
  sortOrder: number;
}

export interface PriceTariffVersion {
  id: string;
  versionNumber: number;
  status: TariffVersionStatus;
  validFrom: string;
  validTo?: string | null;
  publishedAt?: string | null;
  publishedBy?: string | null;
  rate?: TariffRate | null;
  mileagePackages: MileagePackageOption[];
  insuranceOptions: InsuranceOptionRow[];
  extraOptions: ExtraOptionRow[];
}

export interface PriceTariffGroup {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  isActive: boolean;
  sortOrder: number;
  updatedAt: string;
  activeVersion: PriceTariffVersion | null;
  draftVersion: PriceTariffVersion | null;
  scheduledVersions: PriceTariffVersion[];
  archivedVersions: PriceTariffVersion[];
  /** Legacy aggregate — prefer explicit buckets above. */
  versions: PriceTariffVersion[];
}

export interface VehicleTariffAssignment {
  id: string;
  vehicleId: string;
  tariffGroupId: string;
  priceBookId: string;
  isActive: boolean;
  validFrom: string;
  validTo?: string | null;
  vehicle?: {
    id: string;
    make?: string;
    model?: string;
    licensePlate?: string | null;
    year?: number;
  };
  tariffGroup?: { id: string; name: string; category?: string | null };
}

export interface PriceBook {
  id: string;
  name: string;
  currency: string;
  taxRatePercent: number;
  isActive: boolean;
}

export interface PriceTariffCatalog {
  priceBook: PriceBook | null;
  groups: PriceTariffGroup[];
  assignments: VehicleTariffAssignment[];
  unassignedVehicleCount: number;
}

export interface PricingLineItem {
  type: string;
  label: string;
  quantity: number;
  unitPriceCents: number;
  totalNetCents: number;
  taxRatePercent: number;
  totalGrossCents: number;
  sortOrder?: number;
  metadataJson?: PricingLineItemSourceMetadata | Record<string, unknown> | null;
}

export interface PricingLineItemSourceMetadata {
  sourceType?: string;
  sourceId?: string | null;
  lineItemType?: string;
  label?: string;
  quantity?: number;
  unitAmountCents?: number;
  totalAmountCents?: number;
  currency?: string;
  pricingType?: string;
  optionId?: string;
  packageId?: string;
}

export interface PricingContext {
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
  taxRatePercent: number;
  mileagePackages: MileagePackageOption[];
  insuranceOptions: InsuranceOptionRow[];
  extraOptions: ExtraOptionRow[];
  rate: {
    dailyRateCents: number;
    weeklyRateCents: number;
    monthlyRateCents: number;
    includedKmPerDay: number;
    extraKmPriceCents: number;
    minimumRentalDays: number | null;
  };
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

export interface PricingQuoteTotals {
  rentalDays: number;
  subtotalNetCents: number;
  taxAmountCents: number;
  totalGrossCents: number;
  depositAmountCents: number;
  includedKm: number;
  extraKmPriceCents: number;
  totalDueNowCents: number;
  currency: string;
  effectiveDailyRateCents: number;
}

export interface PricingSimulationResult {
  rentalDays: number;
  lineItems: PricingLineItem[];
  subtotalNetCents: number;
  taxAmountCents: number;
  totalGrossCents: number;
  depositAmountCents: number;
  includedKm: number;
  extraKmPriceCents: number;
  totalDueNowCents: number;
  warnings: string[];
  tariffVersionId: string;
  priceBookId: string;
  tariffGroupId: string;
  currency: string;
  effectiveDailyRateCents: number;
  pricingContext: PricingContext;
  quoteId: string;
  calculatedAt: string;
  expiresAt: string;
  totals: PricingQuoteTotals;
}

export interface PricingInputPayload {
  selectedMileagePackageId?: string;
  selectedInsuranceOptionIds?: string[];
  selectedExtraOptionIds?: string[];
  manualDiscountCents?: number;
  manualAdjustmentCents?: number;
}

export type TariffGroupRowStatus = 'active' | 'draft' | 'incomplete' | 'unassigned';
