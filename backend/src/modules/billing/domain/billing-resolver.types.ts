import {
  BillingProductKind,
  BillingAddonKey,
  DiscountKind,
  InvoiceDisplayStatus,
  InvoiceStatusDomain,
  SubscriptionStatus,
  SyncStatus,
} from './billing-domain.types';
import { BillingUsageCalculationStatus } from '@prisma/client';

/** Billing period resolved from subscription or calendar fallback. */
export interface ResolvedBillingPeriod {
  start: Date;
  end: Date;
  source: 'SUBSCRIPTION' | 'CALENDAR_FALLBACK';
}

/**
 * Synthetic subscription item until `BillingSubscriptionItem` exists in persistence.
 * Represents one billable contract line (base plan or add-on).
 */
export interface ResolvedSubscriptionItem {
  /** Synthetic id: `{subscriptionId}:base` or `{subscriptionId}:addon:{key}` */
  id: string;
  productKind: BillingProductKind;
  addonKey: BillingAddonKey | null;
  priceBookId: string | null;
  priceVersionId: string | null;
  quantity: number;
}

/** Organization contract at a point in time — local billing truth. */
export interface ResolvedOrganizationContract {
  organizationId: string;
  subscriptionId: string | null;
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriod: ResolvedBillingPeriod;
  priceBookId: string | null;
  priceVersionId: string | null;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  items: ResolvedSubscriptionItem[];
  resolvedAt: Date;
}

export interface ResolvedPriceTier {
  id: string | null;
  minVehicles: number;
  maxVehicles: number | null;
  unitPriceCents: number | null;
  sortOrder: number;
  status: 'CONFIGURED' | 'UNPRICED';
}

/** Pricing outcome for one subscription item at a point in time. */
export interface ResolvedItemPricing {
  priceBookId: string | null;
  priceVersionId: string | null;
  currency: string | null;
  tier: ResolvedPriceTier | null;
  unitPriceCents: number | null;
  subtotalCents: number | null;
  totalCents: number | null;
  calculationStatus: BillingUsageCalculationStatus;
  quantity: number;
  resolvedAt: Date;
}

/** Billable quantity for SaaS per-vehicle billing. */
export interface ResolvedQuantity {
  organizationId: string;
  asOf: Date;
  connectedVehicleCount: number;
  billableVehicleCount: number;
  billableVehicleIds: string[];
  excludedVehicleIds: string[];
}

/** Org-specific discount resolved for application to pricing. */
export interface ResolvedDiscount {
  id: string;
  kind: DiscountKind;
  customUnitPriceCents: number | null;
  customMonthlyMinimumCents: number | null;
  priceBookId: string | null;
  priceVersionId: string | null;
  reason: string | null;
  validFrom: Date;
  validTo: Date | null;
  sortOrder: number;
}

export interface ResolvedInvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitAmountCents: number | null;
  subtotalCents: number;
  totalCents: number;
  periodStart: Date | null;
  periodEnd: Date | null;
}

/** Local invoice with domain status — no Stripe types. */
export interface ResolvedInvoice {
  id: string;
  subscriptionId: string;
  stripeInvoiceId: string | null;
  amountCents: number;
  currency: string;
  status: InvoiceStatusDomain;
  displayStatus: InvoiceDisplayStatus;
  invoiceDate: Date;
  dueDate: Date | null;
  paidAt: Date | null;
  lines: ResolvedInvoiceLine[];
}

export interface ResolvedPaymentMethod {
  id: string;
  type: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
  status: string;
}

export interface ResolvedInvoicePaymentState {
  organizationId: string;
  defaultPaymentMethod: ResolvedPaymentMethod | null;
  recentInvoices: ResolvedInvoice[];
  resolvedAt: Date;
}

/** Feature entitlement projected from subscription items and legacy licenses. */
export interface ResolvedEntitlement {
  featureKey: string;
  productKind: BillingProductKind;
  addonKey: BillingAddonKey | null;
  granted: boolean;
  source: 'SUBSCRIPTION' | 'LEGACY_LICENSE' | 'DENIED';
  reason: string | null;
}

export interface ResolvedEntitlementSet {
  organizationId: string;
  subscriptionStatus: SubscriptionStatus | null;
  entitlements: ResolvedEntitlement[];
  resolvedAt: Date;
}

/** Stripe adapter results — domain vocabulary only. */
export interface StripeAdapterConfiguration {
  configured: boolean;
  syncStatus: SyncStatus;
  message: string | null;
}

export interface StripeAdapterCustomerResult {
  customerId: string;
  organizationId: string;
}

export interface StripeAdapterPortalSession {
  url: string;
  customerId: string;
  returnUrl: string;
}

export interface StripeAdapterSetupIntent {
  clientSecret: string;
  customerId: string;
  setupIntentId: string;
}

export interface StripeAdapterSyncResult {
  syncStatus: SyncStatus;
  organizationId: string;
  subscriptionId: string | null;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  subscriptionStatus: SubscriptionStatus;
  message: string | null;
}

export interface StripeAdapterPaymentMethodSync {
  syncStatus: SyncStatus;
  synced: number;
  customerId: string | null;
  defaultPaymentMethodId: string | null;
}
