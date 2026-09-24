import type { Prisma } from '@prisma/client';
import type { LongitudinalScientificProfileFingerprintV1 } from './longitudinal-profile-fingerprint';
import type { LongitudinalProfileV1 } from './longitudinal-profile.types';

export type LongitudinalProfileMaterializationPersistenceInput = {
  organizationId: string;
  vehicleId: string;
  longitudinalProfileContractVersion: string;
  profilePolicyVersion: string;
  canonicalProfileFingerprint: string;
  scientificProfileJson: Prisma.InputJsonValue;
  requestedSessionLimit: number;
  appliedSessionLimit: number;
  candidateRestSessionCount: number;
  includedSessionCount: number;
  provisionalSessionCount: number;
  excludedSessionCount: number;
  firstIncludedAnchorAt: Date | null;
  lastIncludedAnchorAt: Date | null;
  profileStatus: string;
};

function parseOptionalAnchor(iso: string | null): Date | null {
  if (iso === null) return null;
  return new Date(iso);
}

export function buildLongitudinalProfileMaterializationPersistenceInput(
  profile: LongitudinalProfileV1,
  fingerprint: LongitudinalScientificProfileFingerprintV1,
): LongitudinalProfileMaterializationPersistenceInput {
  return {
    organizationId: profile.organizationId,
    vehicleId: profile.vehicleId,
    longitudinalProfileContractVersion: profile.longitudinalProfileContractVersion,
    profilePolicyVersion: profile.profilePolicyVersion,
    canonicalProfileFingerprint: fingerprint.canonicalProfileFingerprint,
    scientificProfileJson:
      fingerprint.scientificProjection as unknown as Prisma.InputJsonValue,
    requestedSessionLimit: profile.window.requestedSessionLimit,
    appliedSessionLimit: profile.window.appliedSessionLimit,
    candidateRestSessionCount: profile.coverage.candidateRestSessionCount,
    includedSessionCount: profile.coverage.includedSessionCount,
    provisionalSessionCount: profile.coverage.provisionalSessionCount,
    excludedSessionCount: profile.coverage.excludedSessionCount,
    firstIncludedAnchorAt: parseOptionalAnchor(profile.window.firstIncludedAnchorAt),
    lastIncludedAnchorAt: parseOptionalAnchor(profile.window.lastIncludedAnchorAt),
    profileStatus: profile.profileStatus,
  };
}
