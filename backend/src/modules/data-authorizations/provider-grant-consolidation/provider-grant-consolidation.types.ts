import type { ProviderAccessGrantStatus, PrivacyPolicyLifecycleStatus } from '@prisma/client';
import type { ProviderGrantConsolidationReason } from './provider-grant-consolidation.constants';

export interface ProviderGrantConsolidationInput {
  organizationId: string;
  vehicleId: string | null;
  provider: string;
  providerStatus: ProviderAccessGrantStatus | 'NOT_FOUND' | 'NOT_APPLICABLE';
  grantExpiresAt: Date | null;
  policyStatus: PrivacyPolicyLifecycleStatus | 'NOT_FOUND';
  evaluatedAt: Date;
  /** Informational only — token validity must never drive legal authorization. */
  tokenValid?: boolean | null;
  tokenExpiresAt?: Date | null;
  grantVehicleId?: string | null;
}

export interface ProviderGrantConsolidationResult {
  allowed: boolean;
  blockingReasons: ProviderGrantConsolidationReason[];
  warnings: string[];
}
