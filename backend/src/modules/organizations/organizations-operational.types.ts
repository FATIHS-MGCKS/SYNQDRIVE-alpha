import type { BusinessType, OrganizationStatus } from '@prisma/client';
import type { OrganizationAttentionState } from './organization-attention.util';

export interface OrganizationOperationalQueryDto extends Record<string, unknown> {
  page?: number;
  limit?: number;
  search?: string;
  orgStatus?: OrganizationStatus | string;
  subscriptionStatus?: string;
  attention?: 'yes' | 'critical' | 'warning';
  billingHealth?: 'ok' | 'warning' | 'critical';
  connectivity?: 'ok' | 'degraded' | 'critical';
  syncStatus?: 'NONE' | 'SYNCED' | 'PARTIAL' | 'MISSING';
  businessType?: BusinessType | string;
  paymentMethod?: 'present' | 'missing';
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
  attention: OrganizationAttentionState;
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
