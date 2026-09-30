import type { VehicleOnboardingCaseSourceRef } from '@prisma/client';
import type { VehicleIdentityDraftV1 } from '../contracts/vehicle-identity-draft.v1';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { parseValidatedSourceSnapshot } from './persisted-contract.validation';

/**
 * Canonical draft VIN + each sealed source snapshot VIN must not contradict.
 * Does not promote a source-only VIN into the canonical draft.
 */
export function assertCompositeVinConsistencyForActivation(
  canonicalDraft: VehicleIdentityDraftV1,
  sourceRefs: VehicleOnboardingCaseSourceRef[],
): void {
  const vins: string[] = [];
  const draftVin = canonicalDraft.vin?.trim();
  if (draftVin) vins.push(draftVin);

  for (const ref of sourceRefs) {
    const snap = parseValidatedSourceSnapshot(ref);
    const snapVin = snap.vin?.trim();
    if (snapVin) vins.push(snapVin);
  }

  const unique = new Set(vins);
  if (unique.size > 1) {
    throw new VehicleOnboardingError(
      'IDENTITY_REVIEW_REQUIRED',
      'Canonical draft and source snapshots disagree on VIN evidence',
    );
  }
}
