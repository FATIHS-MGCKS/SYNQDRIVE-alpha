export type BillingCalculationStatus =
  | 'OK'
  | 'PRICE_NOT_CONFIGURED'
  | 'NO_ACTIVE_PRICE_VERSION'
  | 'NO_BILLABLE_VEHICLES';

export type BillingSubscriptionStatus =
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELLED'
  | 'TRIALING'
  | string
  | null;

export interface BillingPriceTierDto {
  id: string;
  minVehicles: number;
  maxVehicles: number | null;
  unitPriceCents: number | null;
  sortOrder: number;
}

export interface BillingSummaryDto {
  organizationId: string;
  subscription: {
    id: string;
    status: BillingSubscriptionStatus;
    cancelAtPeriodEnd: boolean;
  } | null;
  subscriptionStatus: BillingSubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  products: Array<{
    slug: string;
    name: string;
    plan: string;
    planDisplay: string;
    status: string;
  }>;
  billingModel: 'PER_CONNECTED_VEHICLE';
  connectedVehicleCount: number;
  billableVehicleCount: number;
  currentTier: {
    id: string | null;
    minVehicles: number;
    maxVehicles: number | null;
    unitPriceCents: number | null;
    currency: string | null;
    status: 'CONFIGURED' | 'UNPRICED';
  } | null;
  priceBook: {
    id: string;
    name: string;
    currency: string;
    interval: string;
  } | null;
  activePriceVersion: {
    id: string;
    versionNumber: number;
    versionLabel: string | null;
    status: string;
    effectiveFrom: string | null;
  } | null;
  priceTiers: BillingPriceTierDto[];
  stripePortalPrepared?: boolean;
  stripeConfigured?: boolean;
  calculationStatus: BillingCalculationStatus;
  nextInvoicePreview: {
    subtotalCents: number | null;
    taxCents: number | null;
    totalCents: number | null;
    currency: string | null;
    periodStart: string;
    periodEnd: string;
    explanation: string;
  };
  paymentMethod: {
    exists: boolean;
    type?: string;
    brand?: string | null;
    last4?: string | null;
    expMonth?: number | null;
    expYear?: number | null;
    status?: string;
  };
  warnings: string[];
}

export interface BillableVehicleDto {
  id: string;
  licensePlate: string | null;
  vin: string;
  make: string;
  model: string;
  connectivityStatus: 'CONNECTED' | 'NOT_CONNECTED';
  billingStatus: 'BILLABLE' | 'EXCLUDED';
}

export interface ExcludedVehicleDto extends BillableVehicleDto {
  reason: string;
}

export interface BillableVehiclesResponseDto {
  connectedVehicleCount: number;
  billableVehicleCount: number;
  billableVehicles: BillableVehicleDto[];
  excludedVehicles: ExcludedVehicleDto[];
  counts: {
    connected: number;
    billable: number;
    excluded: number;
  };
}

export interface BillingInvoiceLineDto {
  id: string;
  description: string;
  quantity: number;
  unitAmountCents: number | null;
  subtotalCents: number;
  taxCents: number | null;
  totalCents: number;
  periodStart: string | null;
  periodEnd: string | null;
  usageSnapshot?: {
    id: string;
    billableVehicleCount: number;
    unitPriceCents: number | null;
    calculationStatus: string;
    periodStart: string;
    periodEnd: string;
  } | null;
}

export interface BillingInvoiceDto {
  id: string;
  subscriptionId?: string;
  stripeInvoiceId?: string | null;
  amountCents?: number;
  amount?: number;
  currency?: string;
  status?: string;
  displayStatus?: string;
  invoiceDate?: string;
  date?: string;
  dueDate?: string | null;
  paidAt?: string | null;
  invoicePdfUrl?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  netAmountCents?: number | null;
  taxCents?: number | null;
  grossAmountCents?: number | null;
  invoiceLines?: BillingInvoiceLineDto[];
}

export interface PaginatedBillingInvoices {
  data: BillingInvoiceDto[];
  total: number;
  page?: number;
  limit?: number;
}
