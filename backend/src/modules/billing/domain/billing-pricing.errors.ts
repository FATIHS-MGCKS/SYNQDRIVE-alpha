/**
 * Canonical billing price resolution error codes (Prompt 10).
 * Observable in API warnings and resolver outcomes — not HTTP status by default.
 */
export enum BillingPricingErrorCode {
  BILLING_SUBSCRIPTION_NOT_FOUND = 'BILLING_SUBSCRIPTION_NOT_FOUND',
  BILLING_PRICE_NOT_ASSIGNED = 'BILLING_PRICE_NOT_ASSIGNED',
  BILLING_PRICE_VERSION_INVALID = 'BILLING_PRICE_VERSION_INVALID',
  BILLING_LEGACY_FALLBACK_USED = 'BILLING_LEGACY_FALLBACK_USED',
  STRIPE_CATALOG_MAPPING_MISSING = 'STRIPE_CATALOG_MAPPING_MISSING',
}

export type BillingPriceResolutionSource =
  | 'SUBSCRIPTION_ITEM_VERSION'
  | 'SUBSCRIPTION_ITEM_PRICE_BOOK'
  | 'LEGACY_SUBSCRIPTION_CONTRACT'
  | 'LEGACY_MARKED_FALLBACK_DEFAULT'
  | 'UNRESOLVED';

export class BillingPricingResolutionError extends Error {
  constructor(
    public readonly code: BillingPricingErrorCode,
    message: string,
    public readonly organizationId?: string,
  ) {
    super(message);
    this.name = 'BillingPricingResolutionError';
  }
}
