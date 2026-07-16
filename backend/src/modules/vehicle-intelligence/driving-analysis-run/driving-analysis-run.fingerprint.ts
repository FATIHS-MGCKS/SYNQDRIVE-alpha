import { createHash } from 'crypto';
import type { DrivingAnalysisInputIdentity } from './driving-analysis-run.types';

const SECRET_KEY_PATTERN =
  /(secret|password|token|apikey|api_key|authorization|bearer|private_key|credential)/i;

/**
 * Reject identity keys that could smuggle secrets into fingerprints.
 */
export function assertIdentityHasNoSecrets(identity: DrivingAnalysisInputIdentity): void {
  for (const key of Object.keys(identity)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new Error(`Fingerprint identity must not include secret-like key: ${key}`);
    }
  }
  for (const tag of identity.inputTags ?? []) {
    if (SECRET_KEY_PATTERN.test(tag)) {
      throw new Error('Fingerprint inputTags must not contain secret-like values');
    }
  }
}

function normalizePart(value: string | number | boolean | null | undefined): string {
  if (value == null) return '';
  return String(value).trim();
}

/**
 * Deterministic SHA-256 fingerprint from stable input identities only.
 */
export function buildDrivingAnalysisInputFingerprint(
  identity: DrivingAnalysisInputIdentity,
): string {
  assertIdentityHasNoSecrets(identity);

  const parts = [
    identity.organizationId,
    identity.tripId,
    identity.vehicleId,
    identity.analysisType,
    normalizePart(identity.dimoSegmentId),
    normalizePart(identity.tripEndTimeIso),
    normalizePart(identity.behaviorEnrichmentStatus),
    normalizePart(identity.routeEnrichmentStatus),
    normalizePart(identity.nativeEventCount),
    normalizePart(identity.hfPointsCleaned),
    normalizePart(identity.waypointCount),
    identity.capabilityVersion,
    ...(identity.inputTags ?? []).map((tag) => normalizePart(tag)).sort(),
  ];

  return createHash('sha256').update(parts.join('|')).digest('hex');
}

/**
 * Returns true when a new run is required (changed model or input fingerprint).
 */
export function requiresNewAnalysisRun(
  existing: { modelVersion: string; inputFingerprint: string } | null,
  next: { modelVersion: string; inputFingerprint: string },
): boolean {
  if (!existing) return true;
  return (
    existing.modelVersion !== next.modelVersion ||
    existing.inputFingerprint !== next.inputFingerprint
  );
}
