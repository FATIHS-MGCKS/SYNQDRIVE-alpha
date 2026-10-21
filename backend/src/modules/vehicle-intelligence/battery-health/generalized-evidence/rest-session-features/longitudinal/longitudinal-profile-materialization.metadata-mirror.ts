import type { BatteryLongitudinalProfileRevision } from '@prisma/client';
import { ProfileMaterializedMetadataDriftError } from './longitudinal-profile-materialization.errors';
import type { LongitudinalProfileMaterializationPersistenceInput } from './longitudinal-profile-materialization.mapper';

function anchorTimesEqual(
  stored: Date | null,
  expected: Date | null,
): boolean {
  if (stored === null && expected === null) return true;
  if (stored === null || expected === null) return false;
  return stored.getTime() === expected.getTime();
}

export function revisionMetadataMirrorsPersistenceInput(
  revision: BatteryLongitudinalProfileRevision,
  expected: LongitudinalProfileMaterializationPersistenceInput,
): boolean {
  return (
    revision.organizationId === expected.organizationId &&
    revision.vehicleId === expected.vehicleId &&
    revision.longitudinalProfileContractVersion ===
      expected.longitudinalProfileContractVersion &&
    revision.profilePolicyVersion === expected.profilePolicyVersion &&
    revision.canonicalProfileFingerprint === expected.canonicalProfileFingerprint &&
    revision.requestedSessionLimit === expected.requestedSessionLimit &&
    revision.appliedSessionLimit === expected.appliedSessionLimit &&
    revision.candidateRestSessionCount === expected.candidateRestSessionCount &&
    revision.includedSessionCount === expected.includedSessionCount &&
    revision.provisionalSessionCount === expected.provisionalSessionCount &&
    revision.excludedSessionCount === expected.excludedSessionCount &&
    anchorTimesEqual(revision.firstIncludedAnchorAt, expected.firstIncludedAnchorAt) &&
    anchorTimesEqual(revision.lastIncludedAnchorAt, expected.lastIncludedAnchorAt) &&
    revision.profileStatus === expected.profileStatus
  );
}

export function assertRevisionMetadataMirrorsPersistenceInput(
  revision: BatteryLongitudinalProfileRevision,
  expected: LongitudinalProfileMaterializationPersistenceInput,
): void {
  if (!revisionMetadataMirrorsPersistenceInput(revision, expected)) {
    throw new ProfileMaterializedMetadataDriftError();
  }
}
