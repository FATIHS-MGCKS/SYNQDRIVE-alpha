import type { Prisma } from '@prisma/client';
import type { LongitudinalScientificProfileFingerprintV1 } from './longitudinal-profile-fingerprint';

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

/**
 * Derives all persistence fields from the fingerprint's scientific projection only.
 */
export function buildLongitudinalProfileMaterializationPersistenceInput(
  fingerprint: LongitudinalScientificProfileFingerprintV1,
): LongitudinalProfileMaterializationPersistenceInput {
  const projection = fingerprint.scientificProjection;
  return {
    organizationId: projection.organizationId,
    vehicleId: projection.vehicleId,
    longitudinalProfileContractVersion: projection.longitudinalProfileContractVersion,
    profilePolicyVersion: projection.profilePolicyVersion,
    canonicalProfileFingerprint: fingerprint.canonicalProfileFingerprint,
    scientificProfileJson: projection as unknown as Prisma.InputJsonValue,
    requestedSessionLimit: projection.window.requestedSessionLimit,
    appliedSessionLimit: projection.window.appliedSessionLimit,
    candidateRestSessionCount: projection.coverage.candidateRestSessionCount,
    includedSessionCount: projection.coverage.includedSessionCount,
    provisionalSessionCount: projection.coverage.provisionalSessionCount,
    excludedSessionCount: projection.coverage.excludedSessionCount,
    firstIncludedAnchorAt: parseOptionalAnchor(projection.window.firstIncludedAnchorAt),
    lastIncludedAnchorAt: parseOptionalAnchor(projection.window.lastIncludedAnchorAt),
    profileStatus: projection.profileStatus,
  };
}
