import type {
  Prisma,
  VehicleOnboardingCase,
  VehicleOnboardingCaseSourceRef,
} from '@prisma/client';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import type { SourceClaimProvider } from './source-claim-lock';
import { ACTIVE_ONBOARDING_CASE_STATUSES } from './global-source-claim.authority';

export type ActiveSourceClaim = {
  ref: VehicleOnboardingCaseSourceRef;
  onboardingCase: VehicleOnboardingCase;
};

export async function listActiveSourceClaimsForMirror(
  tx: Prisma.TransactionClient,
  provider: SourceClaimProvider,
  sourceMirrorId: string,
): Promise<ActiveSourceClaim[]> {
  const refs = await tx.vehicleOnboardingCaseSourceRef.findMany({
    where: {
      provider,
      sourceMirrorId,
      onboardingCase: { status: { in: [...ACTIVE_ONBOARDING_CASE_STATUSES] } },
    },
    include: { onboardingCase: true },
  });
  return refs.map((ref) => ({
    ref,
    onboardingCase: ref.onboardingCase,
  }));
}

export function assertAtMostOneActiveCaseHoldingMirror(claims: ActiveSourceClaim[]): void {
  const caseIds = new Set(claims.map((c) => c.onboardingCase.id));
  if (caseIds.size > 1) {
    throw new VehicleOnboardingError(
      'SOURCE_CLAIM_INTEGRITY_CONFLICT',
      'Provider source claim integrity conflict',
    );
  }
}

export function assertPrimarySourceMetadataConsistent(
  onboardingCase: VehicleOnboardingCase,
  ref: VehicleOnboardingCaseSourceRef,
): void {
  if (
    onboardingCase.primarySourceProvider !== ref.provider ||
    onboardingCase.primarySourceScopeKey !== ref.connectionScopeKey ||
    onboardingCase.primarySourceExternalId !== ref.externalVehicleIdentity
  ) {
    throw new VehicleOnboardingError(
      'SOURCE_CLAIM_INTEGRITY_CONFLICT',
      'Provider source claim integrity conflict',
    );
  }
}

/**
 * Adopt (open/resume primary): resume only when mirror is the canonical primary source.
 * Secondary attachment on any active case blocks adopt with SOURCE_ALREADY_CLAIMED.
 */
export function resolveAdoptResumeCaseFromClaims(
  claims: ActiveSourceClaim[],
  organizationId: string,
): VehicleOnboardingCase | null {
  assertAtMostOneActiveCaseHoldingMirror(claims);
  if (claims.length === 0) {
    return null;
  }

  const secondaryClaims = claims.filter((c) => !c.ref.isPrimary);
  if (secondaryClaims.length > 0) {
    throw new VehicleOnboardingError(
      'SOURCE_ALREADY_CLAIMED',
      'Provider source is already in use by an active onboarding case',
    );
  }

  const primaryClaims = claims.filter((c) => c.ref.isPrimary);
  if (primaryClaims.length !== 1) {
    throw new VehicleOnboardingError(
      'SOURCE_CLAIM_INTEGRITY_CONFLICT',
      'Provider source claim integrity conflict',
    );
  }

  const { onboardingCase, ref } = primaryClaims[0];
  if (onboardingCase.organizationId !== organizationId) {
    throw new VehicleOnboardingError(
      'SOURCE_ALREADY_CLAIMED',
      'Provider source is already in use by an active onboarding case',
    );
  }
  assertPrimarySourceMetadataConsistent(onboardingCase, ref);
  return onboardingCase;
}

export function assertAttachClaimCompatible(
  claims: ActiveSourceClaim[],
  organizationId: string,
  targetCaseId: string,
): void {
  assertAtMostOneActiveCaseHoldingMirror(claims);
  for (const claim of claims) {
    if (claim.onboardingCase.organizationId !== organizationId) {
      throw new VehicleOnboardingError(
        'SOURCE_ALREADY_CLAIMED',
        'Provider source is already in use by an active onboarding case',
      );
    }
    if (claim.onboardingCase.id !== targetCaseId) {
      throw new VehicleOnboardingError(
        'SOURCE_ALREADY_CLAIMED',
        'Provider source is already in use by an active onboarding case',
      );
    }
  }
}

export async function assertTargetOrganizationExistsInTransaction(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  const org = await tx.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });
  if (!org) {
    throw new VehicleOnboardingError('CASE_NOT_FOUND', 'Onboarding target organization not found');
  }
}
