/**
 * Canonical SynqDrive billing domain types.
 *
 * These are the long-term source of truth for billing vocabulary.
 * Prisma enums and Stripe strings must be mapped through `domain/mappers/*`.
 * Do not use unchecked external strings as domain status values.
 */

export const BillingProductKind = {
  RENTAL: 'RENTAL',
  FLEET: 'FLEET',
  ADDON: 'ADDON',
} as const;
export type BillingProductKind =
  (typeof BillingProductKind)[keyof typeof BillingProductKind];
export const BILLING_PRODUCT_KINDS = Object.values(BillingProductKind);

export const BillingAddonKey = {
  VOICE_AGENT: 'VOICE_AGENT',
  AI_PACKAGE: 'AI_PACKAGE',
  WHATSAPP: 'WHATSAPP',
} as const;
export type BillingAddonKey = (typeof BillingAddonKey)[keyof typeof BillingAddonKey];
export const BILLING_ADDON_KEYS = Object.values(BillingAddonKey);

export const SubscriptionStatus = {
  DRAFT: 'DRAFT',
  TRIALING: 'TRIALING',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  PAUSED: 'PAUSED',
  CANCEL_SCHEDULED: 'CANCEL_SCHEDULED',
  CANCELLED: 'CANCELLED',
  INCOMPLETE: 'INCOMPLETE',
} as const;
export type SubscriptionStatus =
  (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];
export const SUBSCRIPTION_STATUSES = Object.values(SubscriptionStatus);

export const BillingIntervalKind = {
  MONTH: 'MONTH',
  YEAR: 'YEAR',
} as const;
export type BillingIntervalKind =
  (typeof BillingIntervalKind)[keyof typeof BillingIntervalKind];
export const BILLING_INTERVAL_KINDS = Object.values(BillingIntervalKind);

export const PricingModel = {
  VOLUME: 'VOLUME',
  GRADUATED: 'GRADUATED',
  FLAT: 'FLAT',
  USAGE_BASED: 'USAGE_BASED',
} as const;
export type PricingModel = (typeof PricingModel)[keyof typeof PricingModel];
export const PRICING_MODELS = Object.values(PricingModel);

export const DiscountKind = {
  PERCENTAGE: 'PERCENTAGE',
  FIXED_AMOUNT: 'FIXED_AMOUNT',
} as const;
export type DiscountKind = (typeof DiscountKind)[keyof typeof DiscountKind];
export const DISCOUNT_KINDS = Object.values(DiscountKind);

export const InvoiceStatusDomain = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  PAID: 'PAID',
  VOID: 'VOID',
  UNCOLLECTIBLE: 'UNCOLLECTIBLE',
} as const;
export type InvoiceStatusDomain =
  (typeof InvoiceStatusDomain)[keyof typeof InvoiceStatusDomain];
export const INVOICE_STATUS_DOMAIN_VALUES = Object.values(InvoiceStatusDomain);

export const PaymentStatusDomain = {
  PENDING: 'PENDING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
} as const;
export type PaymentStatusDomain =
  (typeof PaymentStatusDomain)[keyof typeof PaymentStatusDomain];
export const PAYMENT_STATUS_DOMAIN_VALUES = Object.values(PaymentStatusDomain);

export const StripeMode = {
  TEST: 'TEST',
  LIVE: 'LIVE',
} as const;
export type StripeMode = (typeof StripeMode)[keyof typeof StripeMode];
export const STRIPE_MODES = Object.values(StripeMode);

export const SyncStatus = {
  PENDING: 'PENDING',
  SYNCED: 'SYNCED',
  FAILED: 'FAILED',
  DRIFTED: 'DRIFTED',
} as const;
export type SyncStatus = (typeof SyncStatus)[keyof typeof SyncStatus];
export const SYNC_STATUSES = Object.values(SyncStatus);

/** API / UI display labels for invoice status — VOID is never Paid. */
export const InvoiceDisplayStatus = {
  DRAFT: 'Draft',
  PENDING: 'Pending',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  VOID: 'Void',
  UNCOLLECTIBLE: 'Uncollectible',
} as const;
export type InvoiceDisplayStatus =
  (typeof InvoiceDisplayStatus)[keyof typeof InvoiceDisplayStatus];

export const UNKNOWN_EXTERNAL_VALUE = 'UNKNOWN' as const;
