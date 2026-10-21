import type { VehicleOnboardingCase, VehicleOnboardingCaseSourceRef } from '@prisma/client';
import { assertPrimarySourceMetadataConsistent } from '../source-adoption/active-source-claim.authority';

export type CandidateDisposition = 'AVAILABLE' | 'RESUMABLE';

export type ActiveClaimInput = {
  ref: Pick<VehicleOnboardingCaseSourceRef, 'isPrimary' | 'provider' | 'connectionScopeKey' | 'externalVehicleIdentity'>;
  onboardingCase: Pick<VehicleOnboardingCase, 'id' | 'organizationId' | 'primarySourceProvider' | 'primarySourceScopeKey' | 'primarySourceExternalId'>;
};

export type ResolvedCandidateDisposition =
  | { disposition: 'AVAILABLE' }
  | { disposition: 'RESUMABLE'; resumableCaseId: string };

/**
 * Read-only candidate disposition from active claims. Never throws for foreign-tenant holds;
 * returns null so the mirror is omitted from the listing (no disclosure).
 */
export function resolveCandidateDispositionFromActiveClaims(
  claims: ActiveClaimInput[],
  organizationId: string,
): ResolvedCandidateDisposition | null {
  const caseIds = new Set(claims.map((c) => c.onboardingCase.id));
  if (caseIds.size > 1) {
    return null;
  }
  if (claims.length === 0) {
    return { disposition: 'AVAILABLE' };
  }

  if (claims.some((c) => !c.ref.isPrimary)) {
    return null;
  }

  const primaryClaims = claims.filter((c) => c.ref.isPrimary);
  if (primaryClaims.length !== 1) {
    return null;
  }

  const { onboardingCase, ref } = primaryClaims[0];
  if (onboardingCase.organizationId !== organizationId) {
    return null;
  }

  try {
    assertPrimarySourceMetadataConsistent(
      onboardingCase as VehicleOnboardingCase,
      ref as VehicleOnboardingCaseSourceRef,
    );
  } catch {
    return null;
  }

  return { disposition: 'RESUMABLE', resumableCaseId: onboardingCase.id };
}
