import { BillingInterval, BillingModel, BillingStripeMode } from '@prisma/client';

export const StripeCatalogMappingErrorCode = {
  MAPPING_NOT_FOUND: 'STRIPE_CATALOG_MAPPING_NOT_FOUND',
  STRIPE_MODE_MISMATCH: 'STRIPE_CATALOG_MODE_MISMATCH',
  CURRENCY_MISMATCH: 'STRIPE_CATALOG_CURRENCY_MISMATCH',
  INTERVAL_MISMATCH: 'STRIPE_CATALOG_INTERVAL_MISMATCH',
  VERSION_NOT_PUBLISHED: 'STRIPE_CATALOG_VERSION_NOT_PUBLISHED',
  VERSION_ARCHIVED: 'STRIPE_CATALOG_VERSION_ARCHIVED',
  DUPLICATE_STRIPE_PRICE_ID: 'STRIPE_CATALOG_DUPLICATE_PRICE_ID',
  LEGACY_FALLBACK_BLOCKED: 'STRIPE_CATALOG_LEGACY_FALLBACK_BLOCKED',
  STRIPE_MAPPING_MISSING: 'STRIPE_CATALOG_MAPPING_MISSING',
  MAPPING_DISABLED: 'STRIPE_CATALOG_MAPPING_DISABLED',
  STRIPE_PRICE_IMMUTABLE: 'STRIPE_CATALOG_PRICE_IMMUTABLE',
  PRODUCT_MISMATCH: 'STRIPE_CATALOG_PRODUCT_MISMATCH',
} as const;

export type StripeCatalogMappingErrorCode =
  (typeof StripeCatalogMappingErrorCode)[keyof typeof StripeCatalogMappingErrorCode];

export const STRIPE_LEGACY_DEFAULT_PRICE_ENV = 'STRIPE_DEFAULT_PRICE_ID' as const;

export const STRIPE_PRESENTATION_PER_UNIT = 'recurring_per_unit' as const;

export interface StripeCatalogMappingView {
  id: string;
  billingProductId: string;
  billingProductKey: string;
  priceVersionId: string;
  priceBookId: string;
  stripeMode: BillingStripeMode;
  stripeProductId: string;
  stripePriceId: string;
  currency: string;
  billingInterval: BillingInterval;
  billingModel: BillingModel;
  stripePresentation: string;
  mappingStatus: string;
  lastVerifiedAt: string | null;
  lastError: string | null;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedStripeCatalogPrice {
  stripePriceId: string;
  stripeProductId: string;
  stripeMode: BillingStripeMode;
  currency: string;
  billingInterval: BillingInterval;
  billingModel: BillingModel;
  stripePresentation: string;
  mappingId: string;
  priceVersionId: string;
  billingProductId: string;
  source: 'CATALOG_MAPPING' | 'LEGACY_DEFAULT_PRICE';
  legacyFallbackUsed: boolean;
}

export function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase();
}

export function mapBillingIntervalToStripe(interval: BillingInterval): 'month' | 'year' {
  return interval === BillingInterval.YEARLY ? 'year' : 'month';
}

export function assertRuntimeStripeMode(
  mappingMode: BillingStripeMode,
  runtimeMode: BillingStripeMode | null,
): void {
  if (!runtimeMode) {
    return;
  }
  if (mappingMode !== runtimeMode) {
    const error = new Error(StripeCatalogMappingErrorCode.STRIPE_MODE_MISMATCH);
    (error as Error & { code: string }).code = StripeCatalogMappingErrorCode.STRIPE_MODE_MISMATCH;
    throw error;
  }
}

export function assertCurrencyMatches(
  expected: string,
  actual: string,
): void {
  if (normalizeCurrency(expected) !== normalizeCurrency(actual)) {
    const error = new Error(StripeCatalogMappingErrorCode.CURRENCY_MISMATCH);
    (error as Error & { code: string }).code = StripeCatalogMappingErrorCode.CURRENCY_MISMATCH;
    throw error;
  }
}

export function assertIntervalMatches(
  expected: BillingInterval,
  actual: BillingInterval,
): void {
  if (expected !== actual) {
    const error = new Error(StripeCatalogMappingErrorCode.INTERVAL_MISMATCH);
    (error as Error & { code: string }).code = StripeCatalogMappingErrorCode.INTERVAL_MISMATCH;
    throw error;
  }
}

export function isModernBillingContract(input: {
  subscriptionPriceVersionId?: string | null;
  subscriptionItemPriceVersionId?: string | null;
}): boolean {
  return Boolean(input.subscriptionPriceVersionId || input.subscriptionItemPriceVersionId);
}

export function buildStripePresentation(model: BillingModel): string {
  switch (model) {
    case BillingModel.PER_CONNECTED_VEHICLE:
      return STRIPE_PRESENTATION_PER_UNIT;
    default:
      return STRIPE_PRESENTATION_PER_UNIT;
  }
}
