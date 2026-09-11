import { canonicalizeBucketTimestamp } from './reference-capture-hf-aggregate-bucket-analysis';
import type { HfCalibrationPhaseProvenance } from './reference-capture-exp-021-physical-authority.lib';
import type {
  HfCalibrationPhaseRecord,
  HfCalibrationPhaseRuntimeCounters,
  HfCalibrationPhaseSummary,
} from './reference-capture-hf-calibration-phase.policy';

export const EXP021_NATIVE_TEMPORAL_EVIDENCE_SCHEMA = 'EXP021_NATIVE_TEMPORAL_v1';
export const EXP021_NATIVE_TEMPORAL_CANONICAL_PRECISION = 'FIELD_PIPE_CANONICAL_ISO_MS';
export const EXP021_NATIVE_TEMPORAL_DUPLICATE_SEMANTICS =
  'UNIQUE_BY_CANONICAL_ISO_MS_SORTED_ASCENDING';
export const EXP021_NATIVE_TEMPORAL_QUERY_ATTRIBUTION =
  'PHASE_NATIVE_FAST_LOOP_EXCLUDES_TRANSITION_AND_RECOVERY_SWEEP';
export const EXP021_NATIVE_TEMPORAL_PROVIDER_IDENTITY = 'DIMO_HF_AGGREGATE_BUCKET';

export type Exp021NativeTemporalEvidenceV1 = {
  schemaVersion: typeof EXP021_NATIVE_TEMPORAL_EVIDENCE_SCHEMA;
  calibrationSeriesId: string;
  calibrationPhaseId: string;
  phaseSequence: number;
  effectivePollIntervalMs: number;
  phaseProvenance: HfCalibrationPhaseProvenance | null;
  canonicalT0At: string | null;
  phaseStartedAt: string;
  phaseEndedAt: string;
  canonicalTimestampPrecision: typeof EXP021_NATIVE_TEMPORAL_CANONICAL_PRECISION;
  duplicateSemantics: typeof EXP021_NATIVE_TEMPORAL_DUPLICATE_SEMANTICS;
  queryAttribution: typeof EXP021_NATIVE_TEMPORAL_QUERY_ATTRIBUTION;
  providerIdentity: typeof EXP021_NATIVE_TEMPORAL_PROVIDER_IDENTITY;
  orderedNativeTemporalBucketStarts: string[];
};

/** Canonicalize, dedupe, and sort native temporal bucket starts for durable evidence. */
export function canonicalizeOrderedNativeTemporalBucketStarts(
  timestamps: string[],
): string[] {
  const unique = new Map<number, string>();
  for (const raw of timestamps) {
    if (!raw) continue;
    try {
      const canonical = canonicalizeBucketTimestamp(raw);
      const ms = Date.parse(canonical);
      if (!Number.isFinite(ms)) continue;
      if (!unique.has(ms)) unique.set(ms, canonical);
    } catch {
      continue;
    }
  }
  return [...unique.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, iso]) => iso);
}

export function buildNativeTemporalEvidenceV1(args: {
  phase: HfCalibrationPhaseRecord;
  counters: HfCalibrationPhaseRuntimeCounters;
  phaseEndedAtIso: string;
}): Exp021NativeTemporalEvidenceV1 {
  const ordered = canonicalizeOrderedNativeTemporalBucketStarts(
    args.counters.nativeUniqueTemporalBucketStarts,
  );
  return {
    schemaVersion: EXP021_NATIVE_TEMPORAL_EVIDENCE_SCHEMA,
    calibrationSeriesId: args.phase.effectiveConfig?.calibrationSeriesId ?? '',
    calibrationPhaseId: args.phase.calibrationPhaseId,
    phaseSequence: args.phase.phaseSequence,
    effectivePollIntervalMs: args.phase.effectivePollIntervalMs,
    phaseProvenance: args.phase.phaseProvenance ?? null,
    canonicalT0At: args.phase.canonicalT0At ?? null,
    phaseStartedAt: args.phase.phaseStartedAt,
    phaseEndedAt: args.phaseEndedAtIso,
    canonicalTimestampPrecision: EXP021_NATIVE_TEMPORAL_CANONICAL_PRECISION,
    duplicateSemantics: EXP021_NATIVE_TEMPORAL_DUPLICATE_SEMANTICS,
    queryAttribution: EXP021_NATIVE_TEMPORAL_QUERY_ATTRIBUTION,
    providerIdentity: EXP021_NATIVE_TEMPORAL_PROVIDER_IDENTITY,
    orderedNativeTemporalBucketStarts: ordered,
  };
}

export function nativeTemporalEvidenceFromPhaseSummary(
  summary: HfCalibrationPhaseSummary,
): Exp021NativeTemporalEvidenceV1 | null {
  return summary.nativeTemporalEvidence ?? null;
}
