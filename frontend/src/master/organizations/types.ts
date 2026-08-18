export type AttentionSeverity = 'none' | 'warning' | 'critical';

export interface OrganizationAttentionDto {
  severity: AttentionSeverity;
  reasons: string[];
  primaryReason: string | null;
  reasonCount: number;
}

export interface OrganizationConnectivitySummaryDto {
  organizationId: string;
  generatedAt: string;
  dimoLinkedVehicles: number;
  freshness: {
    live: number;
    standby: number;
    signal_delayed: number;
    offline: number;
    no_signal: number;
  };
  health: 'ok' | 'degraded' | 'critical';
}

export interface OrganizationOperationalRowDto {
  id: string;
  companyName: string;
  shortCode: string | null;
  businessType: string;
  businessTypeLabel: string;
  city: string;
  country: string;
  orgStatus: string;
  orgStatusLabel: string;
  subscriptionStatus: string;
  subscriptionStatusLabel: string;
  billingHealth: 'ok' | 'warning' | 'critical';
  syncStatus: string;
  paymentMethodStatus: string;
  connectedVehicleCount: number;
  billableVehicleCount: number;
  activeMembershipCount: number;
  tariffLabel: string | null;
  nextChargeAt: string | null;
  openAmountCents: number;
  warnings: string[];
  attention: OrganizationAttentionDto;
  connectivityHealth: 'ok' | 'degraded' | 'critical';
  connectivitySummary?: OrganizationConnectivitySummaryDto;
  lastActiveAt: string;
  createdAt: string;
  paymentsEnabled: boolean;
}

export interface OrganizationOperationalDetailDto extends OrganizationOperationalRowDto {
  contactEmail: string;
  integrations: Array<{
    name: string;
    slug: string;
    status: string;
    statusLabel: string;
    lastSyncAt: string | null;
    errorMessage: string | null;
  }>;
  connectivity: OrganizationConnectivitySummaryDto;
}

export interface OrganizationsOperationalQuery {
  page?: number;
  limit?: number;
  search?: string;
  orgStatus?: string;
  subscriptionStatus?: string;
  attention?: string;
  billingHealth?: string;
  connectivity?: string;
  syncStatus?: string;
  businessType?: string;
  paymentMethod?: string;
}

export interface PaginatedOperationalResponse {
  data: OrganizationOperationalRowDto[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export type OrgDetailTab =
  | 'overview'
  | 'users'
  | 'vehicles'
  | 'billing'
  | 'integrations'
  | 'activity'
  | 'settings';

export const ORG_DETAIL_TABS: Array<{ id: OrgDetailTab; label: string }> = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'users', label: 'Benutzer' },
  { id: 'vehicles', label: 'Fahrzeuge' },
  { id: 'billing', label: 'Abrechnung' },
  { id: 'integrations', label: 'Integrationen' },
  { id: 'activity', label: 'Aktivität' },
  { id: 'settings', label: 'Einstellungen' },
];

export interface BillingOrganizationRow {
  organization: { id: string; companyName: string; status: string };
  subscription: {
    id: string;
    status: string;
    trialEndAt: string | null;
    startedAt: string | null;
    cancelAt: string | null;
    currentPeriodEnd: string | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
  } | null;
  contract: {
    priceVersionLabel: string | null;
    productName: string | null;
  } | null;
  tariffLabel: string | null;
  paymentMethodStatus: string;
  connectedVehicleCount: number;
  billableVehicleCount: number;
  lastInvoice: { id: string; amountCents: number; status: string; invoiceDate: string } | null;
  openAmountCents: number;
  nextChargeAt: string | null;
  syncStatus: string;
  warnings: string[];
  nextInvoicePreview?: { totalCents: number; calculationStatus: string };
}

export interface OrgActivityRow {
  id: string;
  createdAt: string;
  userName?: string;
  action: string;
  entity: string;
  description?: string;
  metaJson?: Record<string, unknown>;
}

export interface OrgVehicleRow {
  id: string;
  vehicleName?: string;
  name?: string;
  vin?: string;
  licensePlate?: string;
  status?: string;
  health?: string;
  onlineStatus?: string;
  lastSignal?: string;
  station?: string;
}

export interface OrgUserRow {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastLoginAt?: string | null;
  last_login?: string;
  pendingInviteId?: string | null;
}
