import { BillingProductKind, SubscriptionStatus } from '../domain/billing-domain.types';

/** Tenant-safe money amount — no Stripe or internal billing identifiers. */
export interface TenantMoneyDto {
  cents: number;
  currency: string;
  formatted: string;
}

export interface TenantSubscriptionPlanDto {
  kind: typeof BillingProductKind.RENTAL | typeof BillingProductKind.FLEET;
  name: string;
}

export interface TenantSubscriptionContractDto {
  status: SubscriptionStatus;
  statusLabel: string;
  trialEndsAt: string | null;
  startedAt: string | null;
  cancellationScheduledAt: string | null;
  billingInterval: string;
  billingIntervalLabel: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  nextPeriodStart: string;
  nextPeriodEnd: string;
}

export interface TenantSubscriptionTierDto {
  label: string;
  minVehicles: number;
  maxVehicles: number | null;
  unitPrice: TenantMoneyDto | null;
}

export interface TenantSubscriptionDiscountDto {
  label: string;
  amount: TenantMoneyDto;
}

export interface TenantSubscriptionPricingDto {
  asOf: string;
  billableVehicleCount: number;
  connectedVehicleCount: number;
  appliedTier: TenantSubscriptionTierDto | null;
  baseAmount: TenantMoneyDto | null;
  discounts: TenantSubscriptionDiscountDto[];
  netAmount: TenantMoneyDto | null;
  taxAmount: TenantMoneyDto | null;
  grossAmount: TenantMoneyDto | null;
  taxConfigured: boolean;
  pricingModel: 'VOLUME' | 'GRADUATED' | null;
}

export interface TenantNextExpectedInvoiceDto {
  periodStart: string;
  periodEnd: string;
  grossAmount: TenantMoneyDto | null;
  dueAt: string | null;
}

export interface TenantSubscriptionBillingDto {
  nextExpectedInvoice: TenantNextExpectedInvoiceDto | null;
  nextChargeAt: string | null;
}

export type TenantPaymentMethodStatus =
  | 'READY'
  | 'MISSING'
  | 'REQUIRES_ACTION'
  | 'FAILED';

export interface TenantDefaultPaymentMethodDto {
  type: 'CARD' | 'SEPA_DEBIT' | 'OTHER';
  typeLabel: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  bankName: string | null;
  mandateStatusLabel: string | null;
}

export interface TenantSubscriptionPaymentMethodDto {
  status: TenantPaymentMethodStatus;
  statusLabel: string;
  defaultMethod: TenantDefaultPaymentMethodDto | null;
  asOf: string;
}

export interface TenantSubscriptionAddOnDto {
  key: string;
  name: string;
  statusLabel: string;
  active: boolean;
}

export type TenantBillingWarningSeverity = 'info' | 'warning' | 'critical';

export interface TenantBillingWarningDto {
  severity: TenantBillingWarningSeverity;
  message: string;
  actionHint: string | null;
}

export type TenantBillingAction =
  | 'VIEW_INVOICES'
  | 'ADD_PAYMENT_METHOD'
  | 'MANAGE_PAYMENT_METHOD'
  | 'OPEN_CUSTOMER_PORTAL'
  | 'UPDATE_PAYMENT_METHOD';

export interface TenantBillingActionDto {
  action: TenantBillingAction;
  label: string;
  requiresWritePermission: boolean;
}

export type TenantSubscriptionOverviewSection =
  | 'contract'
  | 'pricing'
  | 'paymentMethod'
  | 'addOns';

export interface TenantSubscriptionSectionErrorDto {
  section: TenantSubscriptionOverviewSection;
  message: string;
}

export interface TenantSubscriptionOverviewDto {
  asOf: string;
  plan: TenantSubscriptionPlanDto | null;
  contract: TenantSubscriptionContractDto | null;
  pricing: TenantSubscriptionPricingDto | null;
  billing: TenantSubscriptionBillingDto | null;
  paymentMethod: TenantSubscriptionPaymentMethodDto | null;
  addOns: TenantSubscriptionAddOnDto[];
  warnings: TenantBillingWarningDto[];
  availableActions: TenantBillingActionDto[];
  sectionErrors: TenantSubscriptionSectionErrorDto[];
}
