export interface AdminBillingOverviewDto {
  mrr: number;
  arr: number;
  mrrIncomplete?: boolean;
  mrrIncompleteReason?: string | null;
  activeSubscriptions: number;
  trialingSubscriptions: number;
  pastDueSubscriptions: number;
  openInvoices: number;
  paidInvoicesThisMonth: number;
  missingPaymentMethods: number;
  billableConnectedVehicles: number;
  organizationsWithPriceNotConfigured: number;
  stripeSyncErrors: number;
  failedPayments?: number;
  reconciliationDrifts?: number;
  failedEmailDeliveries?: number;
  pricingConfigured: boolean;
}

export interface AdminOrgBillingRowDto {
  organization: { id: string; companyName: string; status: string };
  subscription: {
    id: string;
    status: string;
    lockVersion?: number;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    trialEndAt?: string | null;
    startedAt?: string | null;
    cancelAt?: string | null;
    cancelAtPeriodEnd?: boolean;
    billingAnchorDay?: number | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
  } | null;
  contract?: {
    productKey: string | null;
    productName: string | null;
    priceBookId: string | null;
    priceBookName: string | null;
    priceVersionId: string | null;
    priceVersionLabel: string | null;
    priceVersionStatus: string | null;
  } | null;
  tariffLabel?: string | null;
  products: Array<{
    plan: string;
    status: string;
    product: { slug: string; name: string };
  }>;
  entitlements?: {
    baseProduct: 'RENTAL' | 'FLEET' | null;
    status: string;
    active: boolean;
  };
  connectedVehicleCount: number;
  billableVehicleCount: number;
  currentTier: {
    id: string;
    unitPriceCents: number | null;
    currency: string | null;
  } | null;
  priceStatus: string;
  projectedMonthlyAmountCents: number | null;
  discountCents?: number | null;
  discountSummary?: string | null;
  paymentMethodStatus: string;
  lastInvoice: {
    id: string;
    amountCents: number;
    status: string;
    invoiceDate: string;
  } | null;
  openAmountCents?: number;
  nextChargeAt?: string | null;
  syncStatus?: 'NONE' | 'MISSING' | 'PARTIAL' | 'SYNCED';
  nextInvoicePreview: {
    subtotalCents: number | null;
    discountCents?: number | null;
    amountAfterDiscountCents?: number | null;
    taxCents?: number | null;
    totalCents: number | null;
    calculationStatus: string;
    billableVehicleCount: number;
    discounts?: Array<{ label?: string; amountCents?: number }>;
    warnings?: string[];
    legacyFallbacks?: string[];
  };
  warnings: string[];
}

export interface AdminBillingPriceTierDto {
  id: string;
  minVehicles: number;
  maxVehicles: number | null;
  unitPriceCents: number | null;
  sortOrder: number;
}

export interface AdminBillingPriceVersionDto {
  id: string;
  priceBookId: string;
  versionNumber: number;
  versionLabel: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | string;
  tierMode: string;
  effectiveFrom: string | null;
  effectiveTo?: string | null;
  publishedAt?: string | null;
  usageCount?: number;
  tiers?: AdminBillingPriceTierDto[];
}

export interface AdminBillingPricebookDto {
  id: string;
  name: string;
  productKey: string;
  billingModel: string;
  interval: string;
  currency: string;
  isDefault: boolean;
  billingProductId?: string | null;
  versions?: Array<{
    id: string;
    versionNumber: number;
    versionLabel: string | null;
    status: string;
    effectiveFrom: string | null;
    publishedAt: string | null;
  }>;
}

export interface AdminBillingCatalogProductDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  productRole: 'BASE_PLAN' | 'ADDON' | string;
  status: string;
  sortOrder: number;
  priceBookCount: number;
  subscriptionItemCount: number;
  priceBooks: Array<{
    id: string;
    name: string;
    productKey: string;
    currency: string;
    isDefault: boolean;
    status: string;
  }>;
}

export interface AdminBillingPriceSimulationDto {
  priceVersionId: string;
  vehicleCount: number;
  pricingModel: string;
  tierMode: string;
  currency: string;
  calculationStatus: string;
  matchedTier: {
    minVehicles: number;
    maxVehicles: number | null;
    unitPriceCents: number | null;
  } | null;
  tierLines: Array<{
    tierId: string | null;
    minVehicles: number;
    maxVehicles: number | null;
    quantity: number;
    unitPriceCents: number;
    subtotalCents: number;
    sortOrder: number;
  }>;
  baseAmountCents: number | null;
  discountCents: number;
  netCents: number | null;
  taxRateBps: number | null;
  taxCents: number | null;
  grossCents: number | null;
}

export interface AdminBillingPriceVersionUsageDto {
  priceVersionId: string;
  subscriptions: number;
  subscriptionItems: number;
  total: number;
}

export interface AdminStripeCatalogMappingDto {
  id: string;
  billingProductId: string;
  billingProductKey: string;
  priceVersionId: string;
  priceBookId: string;
  stripeMode: 'TEST' | 'LIVE' | string;
  stripeProductId: string;
  stripePriceId: string;
  currency: string;
  billingInterval: string;
  billingModel: string;
  stripePresentation: string;
  mappingStatus: string;
  lastVerifiedAt: string | null;
  lastError: string | null;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminStripeCatalogMappingStatusDto {
  priceVersionId: string;
  stripeMode: 'TEST' | 'LIVE' | string;
  runtimeStripeMode: 'TEST' | 'LIVE' | string | null;
  mapping: AdminStripeCatalogMappingDto | null;
  modeAligned: boolean | null;
}

export interface AdminBillingInvoiceDto {
  id: string;
  stripeInvoiceId?: string | null;
  status: string;
  displayStatus?: string;
  amountCents: number;
  currency?: string;
  invoiceDate: string;
  dueDate?: string | null;
  paidAt?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  netAmountCents?: number | null;
  taxCents?: number | null;
  grossAmountCents?: number | null;
  invoicePdfUrl?: string | null;
  subscription?: {
    organizationId: string;
    organization: { companyName: string };
  };
  invoiceLines?: Array<{
    id: string;
    description: string;
    quantity: number;
    unitAmountCents: number | null;
    subtotalCents: number;
    taxCents: number | null;
    totalCents: number;
    periodStart?: string | null;
    periodEnd?: string | null;
  }>;
  lines?: AdminBillingInvoiceDto['invoiceLines'];
}

export interface AdminPaymentMethodRowDto {
  id: string;
  organizationId: string;
  organizationName: string;
  hasPaymentMethod: boolean;
  type: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  status: string;
  isDefault: boolean;
  stripeCustomerId: string | null;
  warnings: string[];
}

export interface AdminStripeStatusDto {
  integrationStatus: 'NOT_CONNECTED' | 'PREPARED' | 'CONNECTED';
  stripeSecretConfigured: boolean;
  stripeWebhookConfigured: boolean;
  stripeCustomerMappingCount: number;
  webhookEventCount: number;
  failedWebhookCount: number;
  recentEvents: AdminWebhookEventDto[];
}

export interface AdminWebhookEventDto {
  id: string;
  stripeEventId: string;
  type: string;
  status: string;
  errorMessage: string | null;
  processedAt: string | null;
  createdAt: string;
}

export interface AdminBillingAuditLogDto {
  id: string;
  organizationId: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  createdAt: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export type AdminBillingTab =
  | 'overview'
  | 'organizations'
  | 'pricing'
  | 'invoices-payments'
  | 'system-sync'
  | 'audit';

/** @deprecated Use MasterBillingSection from master-billing-navigation.ts */
export type MasterBillingSection = AdminBillingTab;
