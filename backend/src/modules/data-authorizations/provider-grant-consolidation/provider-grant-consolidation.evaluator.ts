import {
  PrivacyPolicyLifecycleStatus,
  ProviderAccessGrantStatus,
} from '@prisma/client';
import {
  PROVIDER_GRANT_CONSOLIDATION_REASON,
  type ProviderGrantConsolidationReason,
} from './provider-grant-consolidation.constants';
import type {
  ProviderGrantConsolidationInput,
  ProviderGrantConsolidationResult,
} from './provider-grant-consolidation.types';

const ACTIVE_POLICY_STATUSES = new Set<PrivacyPolicyLifecycleStatus>([
  PrivacyPolicyLifecycleStatus.ACTIVE,
]);

const INACTIVE_POLICY_STATUSES = new Set<PrivacyPolicyLifecycleStatus>([
  PrivacyPolicyLifecycleStatus.REVOKED,
  PrivacyPolicyLifecycleStatus.SUSPENDED,
  PrivacyPolicyLifecycleStatus.EXPIRED,
  PrivacyPolicyLifecycleStatus.SUPERSEDED,
]);

/**
 * Pure cross-ledger consistency check — ProviderAccessGrant vs EnforcementPolicy.
 * Token status is explicitly excluded from legal authorization.
 */
export function evaluateProviderGrantConsolidation(
  input: ProviderGrantConsolidationInput,
): ProviderGrantConsolidationResult {
  const blockingReasons: ProviderGrantConsolidationReason[] = [];
  const warnings: string[] = [];

  if (input.grantVehicleId && input.vehicleId && input.grantVehicleId !== input.vehicleId) {
    blockingReasons.push(PROVIDER_GRANT_CONSOLIDATION_REASON.VEHICLE_SCOPE_MISMATCH);
  }

  const providerActive = input.providerStatus === ProviderAccessGrantStatus.ACTIVE;
  const providerRevoked = input.providerStatus === ProviderAccessGrantStatus.REVOKED;
  const policyActive = ACTIVE_POLICY_STATUSES.has(
    input.policyStatus as PrivacyPolicyLifecycleStatus,
  );
  const policyInactive = INACTIVE_POLICY_STATUSES.has(
    input.policyStatus as PrivacyPolicyLifecycleStatus,
  );

  if (providerActive && policyInactive) {
    blockingReasons.push(PROVIDER_GRANT_CONSOLIDATION_REASON.POLICY_REVOKED_PROVIDER_ACTIVE);
    blockingReasons.push(PROVIDER_GRANT_CONSOLIDATION_REASON.PROVIDER_GRANT_POLICY_CONTRADICTION);
  }

  if (providerRevoked && policyActive) {
    blockingReasons.push(PROVIDER_GRANT_CONSOLIDATION_REASON.PROVIDER_REVOKED_POLICY_ACTIVE);
    blockingReasons.push(PROVIDER_GRANT_CONSOLIDATION_REASON.PROVIDER_GRANT_REVOKED);
  }

  if (input.providerStatus === 'NOT_FOUND') {
    blockingReasons.push(PROVIDER_GRANT_CONSOLIDATION_REASON.PROVIDER_GRANT_MISSING);
  } else if (input.providerStatus === ProviderAccessGrantStatus.PENDING) {
    blockingReasons.push(PROVIDER_GRANT_CONSOLIDATION_REASON.PROVIDER_GRANT_PENDING);
  } else if (input.providerStatus === ProviderAccessGrantStatus.REVOKED && !providerRevoked) {
    blockingReasons.push(PROVIDER_GRANT_CONSOLIDATION_REASON.PROVIDER_GRANT_REVOKED);
  }

  if (
    providerActive &&
    input.grantExpiresAt &&
    input.grantExpiresAt.getTime() <= input.evaluatedAt.getTime()
  ) {
    blockingReasons.push(PROVIDER_GRANT_CONSOLIDATION_REASON.PROVIDER_GRANT_EXPIRED);
  }

  if (input.tokenValid === false) {
    warnings.push(PROVIDER_GRANT_CONSOLIDATION_REASON.TOKEN_NOT_LEGAL_BASIS);
  }

  const unique = [...new Set(blockingReasons)];
  const allowed = unique.length === 0 && providerActive && policyActive;

  if (allowed) {
    return {
      allowed: true,
      blockingReasons: [PROVIDER_GRANT_CONSOLIDATION_REASON.CONSISTENT_ACTIVE],
      warnings,
    };
  }

  return { allowed: false, blockingReasons: unique, warnings };
}
