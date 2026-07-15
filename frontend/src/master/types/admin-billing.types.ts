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
  invoiceNumber?: string | null;
  invoiceNumberDisplay?: string | null;
  status: string;
  displayStatus?: string | null;
  amountCents: number;
  currency?: string;
  invoiceDate: string;
  dueDate?: string | null;
  paidAt?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  netAmountCents?: number | null;
  taxAmountCents?: number | null;
  grossAmountCents?: number | null;
  amountRemainingCents?: number | null;
  hostedInvoiceUrl?: string | null;
  invoicePdfUrl?: string | null;
  paymentSummary?: {
    attemptCount: number;
    paymentStatus: string | null;
    paymentMethodLabel: string | null;
    paymentMethodStatus: string | null;
  };
  subscription?: {
    organizationId?: string;
    organization: { companyName: string };
    stripeCustomerId?: string | null;
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
  runtimeStripeMode?: 'TEST' | 'LIVE' | null;
  stripeCustomerMappingCount: number;
  webhookEventCount: number;
  failedWebhookCount: number;
  lastSuccessfulWebhookAt?: string | null;
  lastWebhookAt?: string | null;
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

export interface AdminBillingPaymentRowDto {
  id: string;
  invoiceId: string;
  organizationName: string;
  invoiceNumberLabel: string;
  amountCents: number;
  currency: string;
  status: string;
  statusLabel: string;
  providerLabel: string;
  attemptCount: number;
  succeededAt: string | null;
  failedAt: string | null;
  lastAttemptError: string | null;
  lastAttemptAt: string | null;
}

export interface AdminBillingPaymentAttemptRowDto {
  id: string;
  paymentId: string;
  invoiceId: string;
  organizationName: string;
  invoiceNumberLabel: string;
  attemptNumber: number;
  amountCents: number;
  currency: string;
  status: string;
  statusLabel: string;
  safeErrorMessage: string | null;
  attemptedAt: string;
  nextRetryAt: string | null;
}

export interface AdminBillingRefundRowDto {
  id: string;
  paymentId: string;
  invoiceId: string;
  organizationName: string;
  invoiceNumberLabel: string;
  amountCents: number;
  currency: string;
  status: string;
  statusLabel: string;
  isPartial: boolean;
  refundedAt: string | null;
  stripeRefundId: string | null;
}

export interface AdminBillingCreditNoteRowDto {
  id: string;
  invoiceId: string | null;
  organizationName: string;
  invoiceNumberLabel: string;
  amountCents: number;
  currency: string;
  status: string;
  statusLabel: string;
  issuedAt: string | null;
  hostedUrl: string | null;
  pdfUrl: string | null;
}

export interface AdminBillingReconciliationDriftDto {
  id: string;
  organizationId: string;
  subscriptionId: string | null;
  driftType: string;
  severity: string;
  detectedAt: string;
  autoFixable: boolean;
  detailJson: unknown;
  resolvedAt: string | null;
}

export interface AdminBillingEmailDeliverySummaryDto {
  deliveryId: string;
  outboxEventId: string;
  eventType: string;
  organizationId: string | null;
  deliveryStatus: string;
  deliveryState: string;
  retryCount: number;
  deadLetterReason: string | null;
  resendMessageId: string | null;
  recipientEmail: string | null;
  updatedAt: string;
}

export interface AdminBillingOutboxDeliveryRowDto {
  id: string;
  outboxEventId: string;
  consumerId: string;
  eventType: string;
  organizationId: string | null;
  aggregateType: string;
  aggregateId: string;
  status: string;
  retryCount: number;
  lastError: string | null;
  nextRetryAt: string | null;
  updatedAt: string;
  occurredAt: string;
}

export interface AdminInvoicePaymentHistoryDto {
  invoiceId: string;
  currency: string;
  amountRemaining: { cents: number; currency: string };
  payments: Array<{
    amount: { cents: number; currency: string };
    status: string;
    statusLabel: string;
    providerLabel: string;
    succeededAt: string | null;
    failedAt: string | null;
    attempts: Array<{
      attemptNumber: number;
      status: string;
      statusLabel: string;
      safeErrorMessage: string | null;
      attemptedAt: string;
      nextRetryAt: string | null;
    }>;
    refunds: Array<{
      amount: { cents: number; currency: string };
      status: string;
      statusLabel: string;
      isPartial: boolean;
      refundedAt: string | null;
    }>;
  }>;
  failedAttempts: Array<{
    attemptNumber: number;
    status: string;
    statusLabel: string;
    safeErrorMessage: string | null;
    attemptedAt: string;
  }>;
  refunds: AdminInvoicePaymentHistoryDto['payments'][number]['refunds'];
  creditNotes: Array<{
    amount: { cents: number; currency: string };
    status: string;
    statusLabel: string;
    issuedAt: string | null;
    hostedUrl: string | null;
    pdfUrl: string | null;
  }>;
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
