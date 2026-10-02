import type {
  RawFuelAbsoluteDetectionAdmissibility,
  RawFuelAbsoluteSignalTrust,
} from './raw-fuel-refuel-fallback.types';
import type { RawFuelHybridTrustProvenance } from './raw-fuel-hybrid-absolute-signal-trust.authority';
import {
  isRawFuelHybridTrustReasonCode,
  RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION,
} from './raw-fuel-hybrid-absolute-signal-trust.authority';
import type { RawFuelPrePlateauBaselineRecencyClassification } from '../raw-fuel-rise-detector/raw-fuel-pre-plateau-baseline-recency.policy';

export const HYBRID_ABSOLUTE_SIGNAL_TRUST_EVIDENCE_META_KEY = 'hybridAbsoluteSignalTrust';

export type HybridTrustLocalityAssessment = 'UNKNOWN' | 'VALID' | 'INVALID';

export type HybridTrustRelativeSampleCoverage = 'NONE' | 'PARTIAL' | 'SUFFICIENT';

export type HybridTrustBaselineRecencyClassification =
  | RawFuelPrePlateauBaselineRecencyClassification
  | 'NOT_PROVIDED';

export interface HybridAbsoluteSignalTrustEvidence {
  authorityVersion: string;
  computedHybridClassification: RawFuelAbsoluteSignalTrust;
  reasonCode: string;
  baselineRecencyClassification: HybridTrustBaselineRecencyClassification;
  absoluteDetectionAdmissibility: RawFuelAbsoluteDetectionAdmissibility;
  relativeSampleCoverage: HybridTrustRelativeSampleCoverage;
  absoluteDeltaLiters: number | null;
  relativeDeltaPercent: number | null;
  materialRiseLiters: number;
  materialRisePercent: number;
  relativePrePlateauLocal: HybridTrustLocalityAssessment;
  relativePostPlateauLocal: HybridTrustLocalityAssessment;
  absolutePostPlateauLocal: HybridTrustLocalityAssessment;
}

export type HybridAbsoluteSignalTrustEvidenceReadResult =
  | { kind: 'missing' }
  | { kind: 'malformed' }
  | { kind: 'ok'; value: HybridAbsoluteSignalTrustEvidence };

const HYBRID_TRUST_CLASSIFICATIONS: readonly RawFuelAbsoluteSignalTrust[] = [
  'TRUSTED',
  'UNTRUSTED',
  'UNKNOWN',
];

const HYBRID_DETECTION_ADMISSIBILITY: readonly RawFuelAbsoluteDetectionAdmissibility[] = [
  'ADMISSIBLE',
  'INADMISSIBLE',
  'UNKNOWN',
];

const HYBRID_RELATIVE_COVERAGE: readonly HybridTrustRelativeSampleCoverage[] = [
  'NONE',
  'PARTIAL',
  'SUFFICIENT',
];

const HYBRID_LOCALITY: readonly HybridTrustLocalityAssessment[] = ['UNKNOWN', 'VALID', 'INVALID'];

const HYBRID_BASELINE: readonly HybridTrustBaselineRecencyClassification[] = [
  'FRESH',
  'STALE',
  'INSUFFICIENT_EVIDENCE',
  'NOT_PROVIDED',
];

function isEnumMember<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

function isFiniteNumberOrNull(value: unknown): value is number | null {
  if (value === null) return true;
  return typeof value === 'number' && Number.isFinite(value);
}

function isMaterialRiseNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Strict runtime parse of a hybrid trust evidence block (no TypeScript casts).
 */
export function parseHybridAbsoluteSignalTrustEvidenceBlock(
  block: unknown,
): HybridAbsoluteSignalTrustEvidence | null {
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    return null;
  }
  const m = block as Record<string, unknown>;

  if (!isNonEmptyString(m.authorityVersion)) return null;
  if (!isEnumMember(m.computedHybridClassification, HYBRID_TRUST_CLASSIFICATIONS)) return null;
  if (!isRawFuelHybridTrustReasonCode(m.reasonCode)) return null;
  if (!isEnumMember(m.baselineRecencyClassification, HYBRID_BASELINE)) return null;
  if (!isEnumMember(m.absoluteDetectionAdmissibility, HYBRID_DETECTION_ADMISSIBILITY)) return null;
  if (!isEnumMember(m.relativeSampleCoverage, HYBRID_RELATIVE_COVERAGE)) return null;
  if (!isFiniteNumberOrNull(m.absoluteDeltaLiters)) return null;
  if (!isFiniteNumberOrNull(m.relativeDeltaPercent)) return null;
  if (!isMaterialRiseNumber(m.materialRiseLiters)) return null;
  if (!isMaterialRiseNumber(m.materialRisePercent)) return null;
  if (!isEnumMember(m.relativePrePlateauLocal, HYBRID_LOCALITY)) return null;
  if (!isEnumMember(m.relativePostPlateauLocal, HYBRID_LOCALITY)) return null;
  if (!isEnumMember(m.absolutePostPlateauLocal, HYBRID_LOCALITY)) return null;

  return {
    authorityVersion: m.authorityVersion,
    computedHybridClassification: m.computedHybridClassification,
    reasonCode: m.reasonCode,
    baselineRecencyClassification: m.baselineRecencyClassification,
    absoluteDetectionAdmissibility: m.absoluteDetectionAdmissibility,
    relativeSampleCoverage: m.relativeSampleCoverage,
    absoluteDeltaLiters: m.absoluteDeltaLiters,
    relativeDeltaPercent: m.relativeDeltaPercent,
    materialRiseLiters: m.materialRiseLiters,
    materialRisePercent: m.materialRisePercent,
    relativePrePlateauLocal: m.relativePrePlateauLocal,
    relativePostPlateauLocal: m.relativePostPlateauLocal,
    absolutePostPlateauLocal: m.absolutePostPlateauLocal,
  };
}

export function inspectHybridAbsoluteSignalTrustEvidence(
  evidenceMeta: unknown,
): HybridAbsoluteSignalTrustEvidenceReadResult {
  if (!evidenceMeta || typeof evidenceMeta !== 'object' || Array.isArray(evidenceMeta)) {
    return { kind: 'missing' };
  }
  const root = evidenceMeta as Record<string, unknown>;
  if (!(HYBRID_ABSOLUTE_SIGNAL_TRUST_EVIDENCE_META_KEY in root)) {
    return { kind: 'missing' };
  }
  const block = root[HYBRID_ABSOLUTE_SIGNAL_TRUST_EVIDENCE_META_KEY];
  const parsed = parseHybridAbsoluteSignalTrustEvidenceBlock(block);
  if (!parsed) {
    return { kind: 'malformed' };
  }
  return { kind: 'ok', value: parsed };
}

export function readHybridAbsoluteSignalTrustEvidence(
  evidenceMeta: unknown,
): HybridAbsoluteSignalTrustEvidence | null {
  const inspected = inspectHybridAbsoluteSignalTrustEvidence(evidenceMeta);
  return inspected.kind === 'ok' ? inspected.value : null;
}

export function buildHybridAbsoluteSignalTrustEvidence(
  provenance: RawFuelHybridTrustProvenance,
  locality: {
    relativePrePlateauLocal: HybridAbsoluteSignalTrustEvidence['relativePrePlateauLocal'];
    relativePostPlateauLocal: HybridAbsoluteSignalTrustEvidence['relativePostPlateauLocal'];
    absolutePostPlateauLocal: HybridAbsoluteSignalTrustEvidence['absolutePostPlateauLocal'];
  },
): HybridAbsoluteSignalTrustEvidence {
  return {
    authorityVersion: provenance.authorityVersion,
    computedHybridClassification: provenance.classification,
    reasonCode: provenance.reasonCode,
    baselineRecencyClassification: provenance.baselineRecencyClassification,
    absoluteDetectionAdmissibility: provenance.absoluteDetectionAdmissibility,
    relativeSampleCoverage: provenance.relativeSampleCoverage,
    absoluteDeltaLiters: provenance.absoluteDeltaLiters,
    relativeDeltaPercent: provenance.relativeDeltaPercent,
    materialRiseLiters: provenance.materialRiseLiters,
    materialRisePercent: provenance.materialRisePercent,
    relativePrePlateauLocal: locality.relativePrePlateauLocal,
    relativePostPlateauLocal: locality.relativePostPlateauLocal,
    absolutePostPlateauLocal: locality.absolutePostPlateauLocal,
  };
}

export function mergeHybridAbsoluteSignalTrustEvidence(
  evidenceMeta: Record<string, unknown> | null | undefined,
  hybrid: HybridAbsoluteSignalTrustEvidence,
): Record<string, unknown> {
  return {
    ...(evidenceMeta ?? {}),
    [HYBRID_ABSOLUTE_SIGNAL_TRUST_EVIDENCE_META_KEY]: hybrid,
  };
}

export function isHybridAbsoluteSignalTrustEvidenceComplete(
  hybrid: HybridAbsoluteSignalTrustEvidence | null,
  expectedAuthorityVersion: string = RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION,
): hybrid is HybridAbsoluteSignalTrustEvidence {
  if (!hybrid) return false;
  const reparsed = parseHybridAbsoluteSignalTrustEvidenceBlock(hybrid);
  if (!reparsed) return false;
  return reparsed.authorityVersion === expectedAuthorityVersion;
}
