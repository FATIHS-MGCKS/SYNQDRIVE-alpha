import { createHash } from 'crypto';
import type { MisuseCaseLogicalFingerprintInput } from '../misuse-case-fingerprint/misuse-case-fingerprint.types';
import { buildMisuseCaseLogicalFingerprint } from '../misuse-case-fingerprint/misuse-case-fingerprint';
import { MISUSE_CASE_FINGERPRINT_VERSION } from '../misuse-case-fingerprint/misuse-case-fingerprint.config';
import type { MisuseCaseInputIdentity } from './misuse-case-lifecycle.types';

/**
 * @deprecated P48 — use buildMisuseCaseLogicalFingerprint / buildMisuseCaseFingerprintPair.
 * Kept for transitional callers that still pass trip-level counters.
 */
export function buildMisuseCaseInputFingerprint(identity: MisuseCaseInputIdentity): string {
  const parts = [
    identity.organizationId,
    identity.tripId,
    identity.vehicleId,
    identity.caseType,
    identity.tripEndTimeIso ?? '',
    identity.behaviorEventCount,
    identity.drivingEventCount,
    identity.contextAnchorCount,
    identity.dimoSafetyEventCount,
    identity.dtcEventCount,
    identity.modelVersion ?? MISUSE_CASE_FINGERPRINT_VERSION,
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

export function buildMisuseCaseInputFingerprintFromEvidence(
  input: MisuseCaseLogicalFingerprintInput,
): string {
  return buildMisuseCaseLogicalFingerprint(input);
}

export function requiresMisuseCaseLifecycleRefresh(
  existing: { modelVersion: string; inputFingerprint: string } | null,
  next: { modelVersion: string; inputFingerprint: string },
): boolean {
  if (!existing) return true;
  return (
    existing.modelVersion !== next.modelVersion ||
    existing.inputFingerprint !== next.inputFingerprint
  );
}
