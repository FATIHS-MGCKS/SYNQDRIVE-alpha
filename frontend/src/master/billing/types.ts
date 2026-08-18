export type BillingAttentionSeverity = 'none' | 'info' | 'warning' | 'critical';

export interface BillingAttentionSummary {
  severity: BillingAttentionSeverity;
  reasons: string[];
  primaryReason: string | null;
  reasonCount: number;
  detectedAt: string | null;
}

export type BillingHealth = 'ok' | 'warning' | 'critical';
export type ReconciliationHealth = 'ok' | 'warning' | 'critical';

export interface BillingTrialDto {
  source: 'SYNQDRIVE' | 'STRIPE' | 'NONE';
  active: boolean;
  startedAt: string | null;
  endsAt: string | null;
  daysRemaining: number | null;
  conversionState: 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'CONVERTED' | 'NONE';
}

export interface BillingSubscriptionOperationalRowDto {
  organizationId: string;
  companyName: string;
  subscriptionId: string | null;
  domainStatus: string;
  domainStatusLabel: string;
  productKey: string | null;
  tariffLabel: string | null;
  billingHealth: BillingHealth;
  reconciliationHealth: ReconciliationHealth;
  syncStatus: 'NONE' | 'SYNCED' | 'PARTIAL' | 'MISSING';
  paymentMethodStatus: string;
  trial: BillingTrialDto;
  nextChargeAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  openAmountCents: number;
  attention: BillingAttentionSummary;
  warnings: string[];
  lockVersion: number | null;
  updatedAt: string | null;
}

export interface BillingSubscriptionOperationalDetailDto extends BillingSubscriptionOperationalRowDto {
  organizationStatus: string;
  startedAt: string | null;
  cancelAt: string | null;
  billingAnchorDay: number | null;
  billableVehicleCount: number;
  connectedVehicleCount: number;
  projectedMonthlyAmountCents: number | null;
  priceVersionId: string | null;
  priceVersionLabel: string | null;
  priceBookName: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  openDriftCount: number;
  lastFailedPaymentAt: string | null;
  lastInvoice: {
    id: string;
    amountCents: number;
    status: string;
    invoiceDate: string;
  } | null;
}

export interface BillingOverviewOperationalDto {
  billingHealth: 'healthy' | 'attention' | 'critical';
  billingHealthLabel: string;
  activeSubscriptions: number;
  trialingSubscriptions: number;
  pastDueSubscriptions: number;
  openReconciliationDrifts: number;
  failedPayments: number;
  trialsExpiringCount: number;
  webhookFailures: number;
  missingPaymentMethods: number;
  openInvoices: number;
  reconciliationLastRunAt: string | null;
  lastSuccessfulWebhookAt: string | null;
  loadedAt: string;
  mrr: number | null;
  arr: number | null;
  mrrIncomplete: boolean;
  mrrIncompleteReason: string | null;
}

export interface BillingReconciliationDriftEnrichedDto {
  id: string;
  organizationId: string;
  organizationName: string;
  subscriptionId: string | null;
  driftType: string;
  driftTypeLabel: string;
  severity: string;
  field: string | null;
  localValue: string | null;
  stripeValue: string | null;
  detectedAt: string;
  resolvedAt: string | null;
  autoFixable: boolean;
  resolutionState: 'open' | 'resolved';
}

export interface BillingSubscriptionsQuery {
  page?: number;
  limit?: number;
  search?: string;
  domainStatus?: string;
  billingHealth?: BillingHealth;
  reconciliationHealth?: ReconciliationHealth;
  productKey?: string;
  trialState?: 'active' | 'expiring' | 'none';
  attention?: 'yes' | 'critical' | 'warning';
  attentionCode?: string;
  sort?: 'attention' | 'companyName' | 'nextChargeAt' | 'domainStatus';
  sortDir?: 'asc' | 'desc';
}

export interface PaginatedBillingSubscriptionsResponse {
  data: BillingSubscriptionOperationalRowDto[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}
