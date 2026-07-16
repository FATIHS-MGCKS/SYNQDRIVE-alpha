import { createHash } from 'crypto';
import type { EvidenceCandidate } from '../misuse-case.types';
import { recalculateMisuseCaseEvidenceCounts } from '../misuse-case-evidence-count/misuse-case-evidence-count';
import {
  MISUSE_CASE_FINGERPRINT_VERSION,
} from './misuse-case-fingerprint.config';
import type {
  MisuseCaseFingerprintInput,
  MisuseCaseFingerprintPair,
  MisuseCaseLogicalFingerprintInput,
  MisuseCaseScope,
} from './misuse-case-fingerprint.types';

function sha256(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

function normalizePart(value: string | number | boolean | null | undefined): string {
  if (value == null) return '';
  return String(value).trim();
}

/**
 * Stable qualified evidence keys — qualified units only (P49), no free text.
 */
export function buildQualifiedEvidenceKeys(evidence: EvidenceCandidate[]): string[] {
  return recalculateMisuseCaseEvidenceCounts(evidence).qualifiedEvidenceKeys;
}

export function buildMisuseCaseScope(input: {
  tripId: string;
  bookingId: string | null;
  preferRentalScope?: boolean;
}): MisuseCaseScope {
  if (input.preferRentalScope && input.bookingId) {
    return { kind: 'RENTAL', bookingId: input.bookingId };
  }
  return { kind: 'TRIP', tripId: input.tripId };
}

function buildScopePart(scope: MisuseCaseScope): string {
  return scope.kind === 'TRIP' ? `TRIP:${scope.tripId}` : `RENTAL:${scope.bookingId}`;
}

/**
 * Logical misuse fingerprint — identical qualified inputs yield identical hash.
 * Excludes model version so supersede can detect same pattern across versions.
 */
export function buildMisuseCaseLogicalFingerprint(
  input: MisuseCaseLogicalFingerprintInput,
): string {
  const qualifiedEvidenceKeys = buildQualifiedEvidenceKeys(input.evidence);

  return sha256([
    normalizePart(input.organizationId),
    normalizePart(input.vehicleId),
    buildScopePart(input.scope),
    normalizePart(input.category),
    normalizePart(input.caseType),
    normalizePart(input.attributionScope),
    qualifiedEvidenceKeys.join(','),
  ]);
}

/**
 * Unique case fingerprint including model version.
 */
export function buildMisuseCaseFingerprintPair(
  input: MisuseCaseFingerprintInput,
): MisuseCaseFingerprintPair {
  const qualifiedEvidenceKeys = buildQualifiedEvidenceKeys(input.evidence);
  const logicalFingerprint = buildMisuseCaseLogicalFingerprint(input);
  const modelVersion = input.modelVersion || MISUSE_CASE_FINGERPRINT_VERSION;
  const caseFingerprint = sha256([logicalFingerprint, modelVersion]);

  return {
    logicalFingerprint,
    caseFingerprint,
    modelVersion,
    qualifiedEvidenceKeys,
  };
}

export function requiresMisuseCaseSupersede(
  existing: { modelVersion: string; inputFingerprint: string } | null,
  next: MisuseCaseFingerprintPair,
): boolean {
  if (!existing) return false;
  return (
    existing.inputFingerprint === next.logicalFingerprint &&
    existing.modelVersion !== next.modelVersion
  );
}

export function fingerprintsMatch(
  existing: { fingerprint: string; inputFingerprint: string; modelVersion: string },
  next: MisuseCaseFingerprintPair,
): boolean {
  return (
    existing.fingerprint === next.caseFingerprint &&
    existing.inputFingerprint === next.logicalFingerprint &&
    existing.modelVersion === next.modelVersion
  );
}
