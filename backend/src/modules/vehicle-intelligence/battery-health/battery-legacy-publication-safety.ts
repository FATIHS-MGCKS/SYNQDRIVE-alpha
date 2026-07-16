import {
  BatteryEvidenceSourceType,
  BatteryEvidenceValueType,
  SohPublicationState,
} from '@prisma/client';
import { normalizeBatteryType } from './battery-status';

/** REST above this open-circuit ceiling is likely wake/charging contaminated. */
export const LV_REST_CONTAMINATION_THRESHOLD_V = 13.2;

/** Crank vs rest captures farther apart than this are temporally incompatible. */
export const LV_TEMPORAL_INCOMPATIBILITY_MS = 14 * 24 * 60 * 60 * 1000;

export type LegacyPublicationSafetyReason =
  | 'MEASUREMENT_QUALITY_UNKNOWN'
  | 'REST_LIKELY_CONTAMINATED'
  | 'CRANK_PATH_UNRELIABLE'
  | 'CHEMISTRY_UNKNOWN_OR_UNSUPPORTED'
  | 'TEMPORALLY_INCOMPATIBLE_EVIDENCE'
  | 'SEMANTICALLY_MISLABELED_SOH'
  | 'INCOMPLETE_PROVENANCE';

export type LegacyPublicationDisplayMode = 'DECISION_CAPABLE' | 'LEGACY_UNVERIFIED';

export interface LegacyPublicationEvidenceHint {
  valueType: BatteryEvidenceValueType | string;
  sourceType: BatteryEvidenceSourceType | string;
}

export interface LegacyPublicationSafetyInput {
  publicationState?: SohPublicationState | string | null;
  publishedSohPct?: number | null;
  maturityConfidence?: string | null;
  vOff60m?: number | null;
  vOff6h?: number | null;
  rest60mCapturedAt?: Date | string | null;
  rest6hCapturedAt?: Date | string | null;
  crankDrop?: number | null;
  crankObservationCount?: number | null;
  crankAt?: Date | string | null;
  scoredAt?: Date | string | null;
  lastPublishedAt?: Date | string | null;
  batteryTypeRaw?: string | null;
  /** Recent LV evidence rows used to detect mislabeled SOH_PERCENT semantics. */
  lvEvidenceRecent?: LegacyPublicationEvidenceHint[] | null;
}

export interface LegacyPublicationSafetyResult {
  decisionCapable: boolean;
  displayMode: LegacyPublicationDisplayMode;
  diagnosticLabelDe: string;
  reasons: LegacyPublicationSafetyReason[];
}

const CONFIRMED_LV_SOH_SOURCES: BatteryEvidenceSourceType[] = [
  BatteryEvidenceSourceType.DOCUMENT_CONFIRMED,
  BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT,
  BatteryEvidenceSourceType.MANUAL_REPORT,
];

const MISLABELED_LV_SOH_SOURCES: BatteryEvidenceSourceType[] = [
  BatteryEvidenceSourceType.TELEMETRY_DERIVED,
  BatteryEvidenceSourceType.MODEL_DERIVED,
];

const KNOWN_MATURITY_CONFIDENCE = new Set(['low', 'medium', 'high']);

function toMs(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

export function hasMislabeledLvSohPercentEvidence(
  evidence: LegacyPublicationEvidenceHint[] | null | undefined,
): boolean {
  if (!evidence?.length) return false;
  return evidence.some(
    (row) =>
      row.valueType === BatteryEvidenceValueType.SOH_PERCENT &&
      MISLABELED_LV_SOH_SOURCES.includes(row.sourceType as BatteryEvidenceSourceType),
  );
}

export function hasConfirmedLvSohEvidence(
  evidence: LegacyPublicationEvidenceHint[] | null | undefined,
): boolean {
  if (!evidence?.length) return false;
  return evidence.some(
    (row) =>
      row.valueType === BatteryEvidenceValueType.SOH_PERCENT &&
      CONFIRMED_LV_SOH_SOURCES.includes(row.sourceType as BatteryEvidenceSourceType),
  );
}

/**
 * Central policy: legacy LV publication scores are diagnostic only unless every
 * quality gate passes. Workshop / warning-light / DTC / confirmed manual paths
 * are evaluated elsewhere and must not be weakened here.
 */
export function evaluateLegacyPublicationSafety(
  input: LegacyPublicationSafetyInput,
): LegacyPublicationSafetyResult {
  const reasons: LegacyPublicationSafetyReason[] = [];

  const hasPublication =
    input.publicationState !== SohPublicationState.INITIAL_CALIBRATION &&
    isFiniteNumber(input.publishedSohPct);

  if (!hasPublication) {
    return {
      decisionCapable: false,
      displayMode: 'LEGACY_UNVERIFIED',
      diagnosticLabelDe: 'Keine veröffentlichte LV-Bewertung',
      reasons: [],
    };
  }

  const maturity = (input.maturityConfidence ?? '').trim().toLowerCase();
  if (!maturity || !KNOWN_MATURITY_CONFIDENCE.has(maturity)) {
    reasons.push('MEASUREMENT_QUALITY_UNKNOWN');
  }

  if (
    (isFiniteNumber(input.vOff60m) && input.vOff60m > LV_REST_CONTAMINATION_THRESHOLD_V) ||
    (isFiniteNumber(input.vOff6h) && input.vOff6h > LV_REST_CONTAMINATION_THRESHOLD_V)
  ) {
    reasons.push('REST_LIKELY_CONTAMINATED');
  }

  const crankObs = input.crankObservationCount ?? 0;
  if (crankObs > 0 && !isFiniteNumber(input.crankDrop)) {
    reasons.push('CRANK_PATH_UNRELIABLE');
  }

  const chemistry = normalizeBatteryType(input.batteryTypeRaw);
  if (chemistry === 'LITHIUM' || chemistry === 'UNKNOWN') {
    reasons.push('CHEMISTRY_UNKNOWN_OR_UNSUPPORTED');
  }

  const rest60Ms = toMs(input.rest60mCapturedAt);
  const rest6hMs = toMs(input.rest6hCapturedAt);
  const crankAtMs = toMs(input.crankAt);
  if (rest60Ms != null && rest6hMs != null && rest60Ms === rest6hMs) {
    reasons.push('TEMPORALLY_INCOMPATIBLE_EVIDENCE');
  }
  const latestRestMs = Math.max(rest60Ms ?? 0, rest6hMs ?? 0) || null;
  if (
    latestRestMs != null &&
    crankAtMs != null &&
    Math.abs(latestRestMs - crankAtMs) > LV_TEMPORAL_INCOMPATIBILITY_MS
  ) {
    reasons.push('TEMPORALLY_INCOMPATIBLE_EVIDENCE');
  }

  if (
    hasMislabeledLvSohPercentEvidence(input.lvEvidenceRecent) &&
    !hasConfirmedLvSohEvidence(input.lvEvidenceRecent)
  ) {
    reasons.push('SEMANTICALLY_MISLABELED_SOH');
  }

  if (!toMs(input.scoredAt) || !toMs(input.lastPublishedAt)) {
    reasons.push('INCOMPLETE_PROVENANCE');
  }

  const decisionCapable = reasons.length === 0;

  return {
    decisionCapable,
    displayMode: decisionCapable ? 'DECISION_CAPABLE' : 'LEGACY_UNVERIFIED',
    diagnosticLabelDe: decisionCapable
      ? 'Geschätzter 12V-Zustand (entscheidungsfähig)'
      : 'Legacy / unverifiziert (nicht entscheidungsfähig)',
    reasons,
  };
}

/** Operational LV estimated-health status — UNKNOWN when legacy publication is unsafe. */
export function effectiveLvEstimatedHealthStatusForDecisions(
  estimatedStatus: string,
  safety: LegacyPublicationSafetyResult,
): 'GOOD' | 'WATCH' | 'WARNING' | 'CRITICAL' | 'UNKNOWN' {
  if (!safety.decisionCapable) return 'UNKNOWN';
  if (
    estimatedStatus === 'GOOD' ||
    estimatedStatus === 'WATCH' ||
    estimatedStatus === 'WARNING' ||
    estimatedStatus === 'CRITICAL'
  ) {
    return estimatedStatus;
  }
  return 'UNKNOWN';
}
