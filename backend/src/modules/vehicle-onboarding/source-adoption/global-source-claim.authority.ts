import type { Prisma, VehicleOnboardingCase } from '@prisma/client';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import type { SourceClaimProvider } from './source-claim-lock';

export const ACTIVE_ONBOARDING_CASE_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'READY_FOR_ACTIVATION',
] as const;

export async function findActiveOnboardingCaseHoldingMirror(
  tx: Prisma.TransactionClient,
  provider: SourceClaimProvider,
  sourceMirrorId: string,
): Promise<VehicleOnboardingCase | null> {
  const ref = await tx.vehicleOnboardingCaseSourceRef.findFirst({
    where: {
      provider,
      sourceMirrorId,
      onboardingCase: { status: { in: [...ACTIVE_ONBOARDING_CASE_STATUSES] } },
    },
    include: { onboardingCase: true },
  });
  return ref?.onboardingCase ?? null;
}

export async function findResumableOpenCaseForPrimarySource(
  tx: Prisma.TransactionClient,
  organizationId: string,
  provider: string,
  scopeKey: string,
  externalVehicleIdentity: string,
): Promise<VehicleOnboardingCase | null> {
  return tx.vehicleOnboardingCase.findFirst({
    where: {
      organizationId,
      primarySourceProvider: provider,
      primarySourceScopeKey: scopeKey,
      primarySourceExternalId: externalVehicleIdentity,
      status: { in: [...ACTIVE_ONBOARDING_CASE_STATUSES] },
    },
  });
}

export function assertNoConflictingActiveSourceClaim(
  holder: VehicleOnboardingCase | null,
  organizationId: string,
  targetCaseId: string,
): void {
  if (!holder) {
    return;
  }
  if (holder.organizationId !== organizationId || holder.id !== targetCaseId) {
    throw new VehicleOnboardingError(
      'SOURCE_ALREADY_CLAIMED',
      'Provider source is already in use by an active onboarding case',
    );
  }
}

export function assertAdoptCrossOrgClaimBlocked(
  holder: VehicleOnboardingCase | null,
  organizationId: string,
): void {
  if (holder && holder.organizationId !== organizationId) {
    throw new VehicleOnboardingError(
      'SOURCE_ALREADY_CLAIMED',
      'Provider source is already in use by an active onboarding case',
    );
  }
}
