import type {
  BillingAttentionSummary,
  BillingHealth,
  ReconciliationHealth,
} from './billing-attention.util';

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
