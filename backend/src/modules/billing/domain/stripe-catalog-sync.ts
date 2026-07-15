import { BillingStripeMode } from '@prisma/client';
import { mapBillingIntervalToStripe, normalizeCurrency } from './stripe-catalog-mapping';
import { sortTiersForSchedule, TierScheduleTier } from './tier-pricing-calculator';

export const STRIPE_CATALOG_SYNC_SCHEMA_VERSION = '1' as const;

export const StripeCatalogSyncMetadataKeys = {
  billingProductId: 'synqdriveBillingProductId',
  productKey: 'synqdriveProductKey',
  priceVersionId: 'synqdrivePriceVersionId',
  environment: 'environment',
  schemaVersion: 'schemaVersion',
} as const;

export const StripeCatalogSyncErrorCode = {
  NOT_CONFIGURED: 'STRIPE_CATALOG_SYNC_NOT_CONFIGURED',
  RATE_LIMITED: 'STRIPE_CATALOG_SYNC_RATE_LIMITED',
  PROVIDER_TIMEOUT: 'STRIPE_CATALOG_SYNC_PROVIDER_TIMEOUT',
  PROVIDER_ERROR: 'STRIPE_CATALOG_SYNC_PROVIDER_ERROR',
  PROVIDER_INVALID_REQUEST: 'STRIPE_CATALOG_SYNC_PROVIDER_INVALID_REQUEST',
  PRICE_AMOUNT_DRIFT: 'STRIPE_CATALOG_SYNC_PRICE_AMOUNT_DRIFT',
  PRICE_INACTIVE: 'STRIPE_CATALOG_SYNC_PRICE_INACTIVE',
  PRICE_PRODUCT_MISMATCH: 'STRIPE_CATALOG_SYNC_PRICE_PRODUCT_MISMATCH',
  METADATA_INCONSISTENT: 'STRIPE_CATALOG_SYNC_METADATA_INCONSISTENT',
  UNIT_PRICE_MISSING: 'STRIPE_CATALOG_SYNC_UNIT_PRICE_MISSING',
  STALE_MAPPING: 'STRIPE_CATALOG_SYNC_STALE_MAPPING',
  PRODUCT_NOT_FOUND: 'STRIPE_CATALOG_SYNC_PRODUCT_NOT_FOUND',
  PRICE_NOT_FOUND: 'STRIPE_CATALOG_SYNC_PRICE_NOT_FOUND',
} as const;

export type StripeCatalogSyncErrorCode =
  (typeof StripeCatalogSyncErrorCode)[keyof typeof StripeCatalogSyncErrorCode];

export const STRIPE_CATALOG_SYNC_RATE_LIMIT_DELAY_MS = 120;
export const STRIPE_CATALOG_SYNC_MAX_RETRIES = 3;
export const STRIPE_CATALOG_SYNC_LAST_ERROR_MAX_LENGTH = 500;

export interface StripeCatalogProductMetadataInput {
  billingProductId: string;
  productKey: string;
  stripeMode: BillingStripeMode;
}

export interface StripeCatalogPriceMetadataInput {
  billingProductId: string;
  productKey: string;
  priceVersionId: string;
  stripeMode: BillingStripeMode;
}

export interface StripePriceShape {
  id: string;
  active: boolean;
  currency: string;
  unit_amount: number | null;
  product: string | { id: string };
  recurring?: { interval: string } | null;
  metadata?: Record<string, string>;
}

export interface StripeProductShape {
  id: string;
  active: boolean;
  metadata?: Record<string, string>;
}

export interface StripeCatalogSyncResult {
  priceVersionId: string;
  stripeMode: BillingStripeMode;
  mappingId: string;
  stripeProductId: string;
  stripePriceId: string;
  mappingStatus: string;
  createdProduct: boolean;
  createdPrice: boolean;
  metadataSynced: boolean;
  driftDetected: boolean;
  verified: boolean;
  lastError: string | null;
}

export function stripeModeToEnvironment(mode: BillingStripeMode): string {
  return mode === 'LIVE' ? 'live' : 'test';
}

export function buildStripeCatalogProductIdempotencyKey(
  billingProductId: string,
  stripeMode: BillingStripeMode,
): string {
  return `stripe-catalog-sync:product:${billingProductId}:${stripeMode}:v${STRIPE_CATALOG_SYNC_SCHEMA_VERSION}`;
}

export function buildStripeCatalogPriceIdempotencyKey(
  priceVersionId: string,
  stripeMode: BillingStripeMode,
): string {
  return `stripe-catalog-sync:price:${priceVersionId}:${stripeMode}:v${STRIPE_CATALOG_SYNC_SCHEMA_VERSION}`;
}

export function buildStripeCatalogProductMetadata(
  input: StripeCatalogProductMetadataInput,
): Record<string, string> {
  return {
    [StripeCatalogSyncMetadataKeys.billingProductId]: input.billingProductId,
    [StripeCatalogSyncMetadataKeys.productKey]: input.productKey,
    [StripeCatalogSyncMetadataKeys.environment]: stripeModeToEnvironment(input.stripeMode),
    [StripeCatalogSyncMetadataKeys.schemaVersion]: STRIPE_CATALOG_SYNC_SCHEMA_VERSION,
  };
}

export function buildStripeCatalogPriceMetadata(
  input: StripeCatalogPriceMetadataInput,
): Record<string, string> {
  return {
    [StripeCatalogSyncMetadataKeys.billingProductId]: input.billingProductId,
    [StripeCatalogSyncMetadataKeys.productKey]: input.productKey,
    [StripeCatalogSyncMetadataKeys.priceVersionId]: input.priceVersionId,
    [StripeCatalogSyncMetadataKeys.environment]: stripeModeToEnvironment(input.stripeMode),
    [StripeCatalogSyncMetadataKeys.schemaVersion]: STRIPE_CATALOG_SYNC_SCHEMA_VERSION,
  };
}

export function resolveCatalogStripeUnitAmountCents(tiers: TierScheduleTier[]): number {
  const sorted = sortTiersForSchedule(tiers);
  if (sorted.length === 0) {
    const error = new Error(StripeCatalogSyncErrorCode.UNIT_PRICE_MISSING);
    (error as Error & { code: string }).code = StripeCatalogSyncErrorCode.UNIT_PRICE_MISSING;
    throw error;
  }

  const entryTier = sorted[0];
  if (entryTier.unitPriceCents == null || entryTier.unitPriceCents < 0) {
    const error = new Error(StripeCatalogSyncErrorCode.UNIT_PRICE_MISSING);
    (error as Error & { code: string }).code = StripeCatalogSyncErrorCode.UNIT_PRICE_MISSING;
    throw error;
  }

  return entryTier.unitPriceCents;
}

export function resolveStripeProductId(product: string | { id: string }): string {
  return typeof product === 'string' ? product : product.id;
}

export function assertStripePriceMatchesLocal(input: {
  stripePrice: StripePriceShape;
  expectedUnitAmountCents: number;
  expectedCurrency: string;
  expectedInterval: 'month' | 'year';
  expectedProductId: string;
}): void {
  const productId = resolveStripeProductId(input.stripePrice.product);

  if (!input.stripePrice.active) {
    const error = new Error(StripeCatalogSyncErrorCode.PRICE_INACTIVE);
    (error as Error & { code: string }).code = StripeCatalogSyncErrorCode.PRICE_INACTIVE;
    throw error;
  }

  if (productId !== input.expectedProductId) {
    const error = new Error(StripeCatalogSyncErrorCode.PRICE_PRODUCT_MISMATCH);
    (error as Error & { code: string }).code = StripeCatalogSyncErrorCode.PRICE_PRODUCT_MISMATCH;
    throw error;
  }

  if (normalizeCurrency(input.stripePrice.currency) !== normalizeCurrency(input.expectedCurrency)) {
    const error = new Error(StripeCatalogSyncErrorCode.METADATA_INCONSISTENT);
    (error as Error & { code: string }).code = StripeCatalogSyncErrorCode.METADATA_INCONSISTENT;
    throw error;
  }

  const stripeInterval = input.stripePrice.recurring?.interval;
  if (stripeInterval !== input.expectedInterval) {
    const error = new Error(StripeCatalogSyncErrorCode.METADATA_INCONSISTENT);
    (error as Error & { code: string }).code = StripeCatalogSyncErrorCode.METADATA_INCONSISTENT;
    throw error;
  }

  if (input.stripePrice.unit_amount !== input.expectedUnitAmountCents) {
    const error = new Error(StripeCatalogSyncErrorCode.PRICE_AMOUNT_DRIFT);
    (error as Error & { code: string }).code = StripeCatalogSyncErrorCode.PRICE_AMOUNT_DRIFT;
    throw error;
  }
}

export function assertStripeMetadataMatches(
  metadata: Record<string, string> | undefined,
  expected: Record<string, string>,
): void {
  for (const [key, value] of Object.entries(expected)) {
    if ((metadata?.[key] ?? '') !== value) {
      const error = new Error(StripeCatalogSyncErrorCode.METADATA_INCONSISTENT);
      (error as Error & { code: string }).code = StripeCatalogSyncErrorCode.METADATA_INCONSISTENT;
      throw error;
    }
  }
}

export function truncateSyncErrorMessage(message: string): string {
  return message.slice(0, STRIPE_CATALOG_SYNC_LAST_ERROR_MAX_LENGTH);
}

export function translateStripeProviderError(error: unknown): {
  code: StripeCatalogSyncErrorCode;
  message: string;
} {
  const stripeType =
    error && typeof error === 'object' && 'type' in error ? String((error as { type: string }).type) : '';

  if (stripeType === 'StripeRateLimitError') {
    return {
      code: StripeCatalogSyncErrorCode.RATE_LIMITED,
      message: StripeCatalogSyncErrorCode.RATE_LIMITED,
    };
  }

  if (stripeType === 'StripeConnectionError' || stripeType === 'StripeAPIError') {
    const rawCode =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code: string }).code)
        : '';
    if (rawCode === 'timeout' || rawCode === 'request_timeout') {
      return {
        code: StripeCatalogSyncErrorCode.PROVIDER_TIMEOUT,
        message: StripeCatalogSyncErrorCode.PROVIDER_TIMEOUT,
      };
    }
  }

  if (stripeType === 'StripeInvalidRequestError') {
    return {
      code: StripeCatalogSyncErrorCode.PROVIDER_INVALID_REQUEST,
      message: StripeCatalogSyncErrorCode.PROVIDER_INVALID_REQUEST,
    };
  }

  if (error instanceof Error && error.message) {
    const lowered = error.message.toLowerCase();
    if (lowered.includes('timeout') || lowered.includes('timed out')) {
      return {
        code: StripeCatalogSyncErrorCode.PROVIDER_TIMEOUT,
        message: StripeCatalogSyncErrorCode.PROVIDER_TIMEOUT,
      };
    }
  }

  return {
    code: StripeCatalogSyncErrorCode.PROVIDER_ERROR,
    message: StripeCatalogSyncErrorCode.PROVIDER_ERROR,
  };
}

export function mapBillingIntervalToStripeInterval(
  interval: Parameters<typeof mapBillingIntervalToStripe>[0],
): 'month' | 'year' {
  return mapBillingIntervalToStripe(interval);
}
