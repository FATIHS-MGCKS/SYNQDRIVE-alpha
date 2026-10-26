import { createHash } from 'node:crypto';
import type {
  VsiProfileEvaluationResult,
  VsiProfileSignalFingerprintV1,
} from './vsi-profile.types';

/**
 * Fields excluded from semantic profile identity.
 * Quality/freshness/confidence are evaluation-time projections of source timestamps;
 * revision identity uses empiricalObservation + lastSourceTimestamp instead.
 */
const OPERATIONAL_SIGNAL_FIELDS = new Set([
  'lastProviderFetchAt',
  'contentFingerprint',
  'freshnessClassification',
  'qualityClassification',
  'confidenceLevel',
  /** Bundle-ledger window metrics — revision identity uses source timestamps instead. */
  'observedSamples',
  'provenSourceAdvances',
  'observedCadenceMedianSeconds',
  'observedCadenceSampleCount',
  'maxStaleIntervalSeconds',
  /** Full cadence blob is operational; semantic identity uses cadenceSemanticFingerprint only. */
  'cadenceIntelligence',
]);

/** Signals whose lastValidObservationAt tracks fetch wall clock, not physics source time. */
const FETCH_BOOKKEEPING_SIGNAL_KEYS = new Set([
  'provider_last_successful_fetch',
]);

export type VsiProfileSemanticFingerprintInput = {
  contractVersion: string;
  providerSourceLinkId: string;
  providerIdentity: string;
  verifiedModality: string | null;
  telemetrySourceFamily: string | null;
  declaredCatalogCheckedAt: Date | string | null;
  lastMaterializedSourceTimestamp: Date | string | null;
  lastProvenStrictSourceAdvanceAt: Date | string | null;
  profileLimitations: readonly string[];
  signals: readonly VsiProfileSignalFingerprintV1[];
};

function iso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function projectVsiSignalSemanticFingerprintFields(
  signal: VsiProfileSignalFingerprintV1,
): Record<string, unknown> {
  const entries = Object.entries(signal).filter(([key]) => {
    if (OPERATIONAL_SIGNAL_FIELDS.has(key)) return false;
    if (
      FETCH_BOOKKEEPING_SIGNAL_KEYS.has(signal.canonicalSignalKey) &&
      key === 'lastValidObservationAt'
    ) {
      return false;
    }
    return true;
  });
  const projected = Object.fromEntries(entries) as Record<string, unknown>;
  if (projected.strictSourceAdvanced !== true) {
    projected.strictSourceAdvanced = 'NOT_ADVANCED';
  }
  if (Array.isArray(projected.limitations)) {
    projected.limitations = [...projected.limitations].sort();
  }
  if (Array.isArray(projected.evidenceProvenance)) {
    projected.evidenceProvenance = [...projected.evidenceProvenance].sort();
  }
  const cadence = signal.cadenceIntelligence;
  if (cadence?.cadenceSemanticFingerprint) {
    projected.cadenceSemanticFingerprint = cadence.cadenceSemanticFingerprint;
  }
  return projected;
}

export function buildVsiProfileSemanticFingerprintPayload(
  input: VsiProfileSemanticFingerprintInput,
): Record<string, unknown> {
  const signals = [...input.signals]
    .map((signal) => projectVsiSignalSemanticFingerprintFields(signal))
    .sort((a, b) =>
      String(a.canonicalSignalKey).localeCompare(String(b.canonicalSignalKey)),
    );

  return {
    contractVersion: input.contractVersion,
    providerSourceLinkId: input.providerSourceLinkId,
    providerIdentity: input.providerIdentity,
    verifiedModality: input.verifiedModality,
    telemetrySourceFamily: input.telemetrySourceFamily,
    declaredCatalogCheckedAt: iso(input.declaredCatalogCheckedAt),
    lastMaterializedSourceTimestamp: iso(input.lastMaterializedSourceTimestamp),
    lastProvenStrictSourceAdvanceAt: iso(input.lastProvenStrictSourceAdvanceAt),
    profileLimitations: [...input.profileLimitations].sort(),
    signals,
  };
}

function stableSerialize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stableSerialize(entry));
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = stableSerialize(record[key]);
        return acc;
      }, {});
  }
  return value;
}

function hashSemanticPayload(payload: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(stableSerialize(payload)))
    .digest('hex');
}

function semanticPayloadsEqual(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  return (
    JSON.stringify(stableSerialize(left)) === JSON.stringify(stableSerialize(right))
  );
}

/** Semantic capability fingerprint — excludes fetch/evaluation bookkeeping. */
export function fingerprintVsiProfileSemanticEvaluation(
  evaluation: VsiProfileEvaluationResult,
): string {
  return hashSemanticPayload(buildVsiProfileSemanticFingerprintPayload(evaluation));
}

export function persistedProfileToSemanticFingerprintInput(persisted: {
  profileContractVersion: string;
  providerSourceLinkId: string;
  providerIdentity: string;
  verifiedModality: string | null;
  telemetrySourceFamily: string | null;
  declaredCatalogCheckedAt: Date | null;
  lastMaterializedSourceTimestamp: Date | null;
  lastProvenStrictSourceAdvanceAt: Date | null;
  profileLimitations: unknown;
  signalsSnapshot: unknown;
}): VsiProfileSemanticFingerprintInput {
  return {
    contractVersion: persisted.profileContractVersion,
    providerSourceLinkId: persisted.providerSourceLinkId,
    providerIdentity: persisted.providerIdentity,
    verifiedModality: persisted.verifiedModality,
    telemetrySourceFamily: persisted.telemetrySourceFamily,
    declaredCatalogCheckedAt: persisted.declaredCatalogCheckedAt,
    lastMaterializedSourceTimestamp: persisted.lastMaterializedSourceTimestamp,
    lastProvenStrictSourceAdvanceAt: persisted.lastProvenStrictSourceAdvanceAt,
    profileLimitations: Array.isArray(persisted.profileLimitations)
      ? (persisted.profileLimitations as string[])
      : [],
    signals: Array.isArray(persisted.signalsSnapshot)
      ? (persisted.signalsSnapshot as VsiProfileSignalFingerprintV1[])
      : [],
  };
}

export function evaluationToSemanticFingerprintInput(
  evaluation: VsiProfileEvaluationResult,
): VsiProfileSemanticFingerprintInput {
  return {
    contractVersion: evaluation.contractVersion,
    providerSourceLinkId: evaluation.providerSourceLinkId,
    providerIdentity: evaluation.providerIdentity,
    verifiedModality: evaluation.verifiedModality,
    telemetrySourceFamily: evaluation.telemetrySourceFamily,
    declaredCatalogCheckedAt: evaluation.declaredCatalogCheckedAt,
    lastMaterializedSourceTimestamp: evaluation.lastMaterializedSourceTimestamp,
    lastProvenStrictSourceAdvanceAt: evaluation.lastProvenStrictSourceAdvanceAt,
    profileLimitations: evaluation.profileLimitations,
    signals: evaluation.signals,
  };
}

export function areVsiProfileSemanticEvaluationsEquivalent(
  persisted: {
    profileContractVersion: string;
    providerSourceLinkId: string;
    providerIdentity: string;
    verifiedModality: string | null;
    telemetrySourceFamily: string | null;
    declaredCatalogCheckedAt: Date | null;
    lastMaterializedSourceTimestamp: Date | null;
    lastProvenStrictSourceAdvanceAt: Date | null;
    profileLimitations: unknown;
    signalsSnapshot: unknown;
  },
  evaluation: VsiProfileEvaluationResult,
): boolean {
  const left = buildVsiProfileSemanticFingerprintPayload(
    persistedProfileToSemanticFingerprintInput(persisted),
  );
  const right = buildVsiProfileSemanticFingerprintPayload(
    evaluationToSemanticFingerprintInput(evaluation),
  );
  return semanticPayloadsEqual(left, right);
}

export function fingerprintVsiProfileSemanticFromPersisted(input: {
  profileContractVersion: string;
  providerSourceLinkId: string;
  providerIdentity: string;
  verifiedModality: string | null;
  telemetrySourceFamily: string | null;
  declaredCatalogCheckedAt: Date | null;
  lastMaterializedSourceTimestamp: Date | null;
  lastProvenStrictSourceAdvanceAt: Date | null;
  profileLimitations: unknown;
  signalsSnapshot: unknown;
}): string {
  const limitations = Array.isArray(input.profileLimitations)
    ? (input.profileLimitations as string[])
    : [];
  const signals = Array.isArray(input.signalsSnapshot)
    ? (input.signalsSnapshot as VsiProfileSignalFingerprintV1[])
    : [];

  return hashSemanticPayload(
    buildVsiProfileSemanticFingerprintPayload({
      contractVersion: input.profileContractVersion,
      providerSourceLinkId: input.providerSourceLinkId,
      providerIdentity: input.providerIdentity,
      verifiedModality: input.verifiedModality,
      telemetrySourceFamily: input.telemetrySourceFamily,
      declaredCatalogCheckedAt: input.declaredCatalogCheckedAt,
      lastMaterializedSourceTimestamp: input.lastMaterializedSourceTimestamp,
      lastProvenStrictSourceAdvanceAt: input.lastProvenStrictSourceAdvanceAt,
      profileLimitations: limitations,
      signals,
    }),
  );
}

/**
 * @deprecated Use {@link fingerprintVsiProfileSemanticEvaluation} for revision identity.
 * Kept as alias during P0 hardening migration.
 */
export function fingerprintVsiProfileEvaluation(
  evaluation: VsiProfileEvaluationResult,
): string {
  return fingerprintVsiProfileSemanticEvaluation(evaluation);
}
