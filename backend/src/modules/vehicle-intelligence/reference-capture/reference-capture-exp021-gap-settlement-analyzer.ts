import { buildExp021BucketIdentity } from './reference-capture-settlement-shadow-bucket-identity';
import { HF_AGGREGATE_BUCKET_INTERVAL_MS } from './reference-capture-hf-aggregate-bucket-analysis';
import { EXP021_MANDATORY_AGES_MS } from './reference-capture-settlement-shadow.policy';

export const EXP021_GAP_SETTLEMENT_MIN_GAP_MS = 10_000;

export type NativeTemporalGap = {
  phaseLabel: string;
  gapIndex: number;
  gapStartIso: string;
  gapEndIso: string;
  gapDurationMs: number;
  previousBucketTemporalIso: string;
  nextBucketTemporalIso: string;
};

export type SettlementProbeRef = {
  probeId: string;
  phaseLabel: string;
  sourceIntervalStartIso: string;
  sourceIntervalEndIso: string;
};

export type SettlementObservationRef = {
  probeId: string;
  scheduledAgeMs: number;
  providerRequestStatus: string;
  rawRowCount: number;
  uniqueBucketIdentities: string[];
};

export type InteriorBucketSettlementClassification =
  | 'PRESENT_AT_FIRST_SUCCESS'
  | 'FIRST_SEEN_AT_30'
  | 'FIRST_SEEN_AT_60'
  | 'FIRST_SEEN_AT_120'
  | 'FIRST_SEEN_AT_180'
  | 'FIRST_SEEN_AT_300'
  | 'FIRST_SEEN_AT_600'
  | 'NEVER_SEEN_BY_600'
  | 'QUERY_OBSERVATION_FAILURE'
  | 'NOT_ASSESSABLE';

export type GapSettlementRow = {
  phaseLabel: string;
  gapStartIso: string;
  gapEndIso: string;
  gapDurationMs: number;
  interiorBucketIdentity: string;
  interiorTemporalIso: string;
  overlappingProbeId: string | null;
  overlapClassification:
    | 'EXACT_PROBE_COVERED'
    | 'NOT_ASSESSABLE_NO_OVERLAPPING_SETTLEMENT_PROBE';
  settlementClassification: InteriorBucketSettlementClassification;
  firstSeenAgeMs: number | null;
  gapKind: 'LIVE_POLL_CADENCE_GAP';
};

const AGE_CLASSIFIERS: Array<{ ms: number; label: InteriorBucketSettlementClassification }> =
  EXP021_MANDATORY_AGES_MS.map((ms) => ({
    ms,
    label: `FIRST_SEEN_AT_${ms / 1000}` as InteriorBucketSettlementClassification,
  }));

export function extractNativeTemporalGaps(args: {
  phaseLabel: string;
  nativeTemporalBucketStarts: string[];
  minGapMs: number;
}): NativeTemporalGap[] {
  const sorted = [...new Set(args.nativeTemporalBucketStarts)]
    .map((iso) => ({ iso, ms: Date.parse(iso) }))
    .filter((row) => Number.isFinite(row.ms))
    .sort((a, b) => a.ms - b.ms);

  const gaps: NativeTemporalGap[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const durationMs = sorted[i].ms - sorted[i - 1].ms;
    if (durationMs < args.minGapMs) continue;
    gaps.push({
      phaseLabel: args.phaseLabel,
      gapIndex: gaps.length,
      gapStartIso: new Date(sorted[i - 1].ms).toISOString(),
      gapEndIso: new Date(sorted[i].ms).toISOString(),
      gapDurationMs: durationMs,
      previousBucketTemporalIso: sorted[i - 1].iso,
      nextBucketTemporalIso: sorted[i].iso,
    });
  }
  return gaps;
}

export function expectedInteriorTemporalBuckets(gap: NativeTemporalGap): string[] {
  const startMs = Date.parse(gap.gapStartIso) + HF_AGGREGATE_BUCKET_INTERVAL_MS;
  const endMs = Date.parse(gap.gapEndIso);
  const interiors: string[] = [];
  for (let ms = startMs; ms < endMs; ms += HF_AGGREGATE_BUCKET_INTERVAL_MS) {
    interiors.push(new Date(ms).toISOString());
  }
  return interiors;
}

export function interiorBucketIdentities(
  interiorTemporalIsos: string[],
  primaryField: string,
): string[] {
  return interiorTemporalIsos.map((iso) => buildExp021BucketIdentity(primaryField, iso));
}

export function findSettlementProbeCoveringInterval(
  probes: SettlementProbeRef[],
  intervalStartMs: number,
  intervalEndMs: number,
): SettlementProbeRef | null {
  for (const probe of probes) {
    const probeStart = Date.parse(probe.sourceIntervalStartIso);
    const probeEnd = Date.parse(probe.sourceIntervalEndIso);
    if (!Number.isFinite(probeStart) || !Number.isFinite(probeEnd)) continue;
    if (probeStart <= intervalStartMs && probeEnd >= intervalEndMs) {
      return probe;
    }
  }
  return null;
}

function classifyFirstSeenAge(
  bucketIdentity: string,
  observations: SettlementObservationRef[],
): { classification: InteriorBucketSettlementClassification; firstSeenAgeMs: number | null } {
  const byAge = [...observations].sort((a, b) => a.scheduledAgeMs - b.scheduledAgeMs);
  let sawFailure = false;

  for (const obs of byAge) {
    if (obs.rawRowCount === 0 || obs.providerRequestStatus === 'ZERO_RESULT') {
      sawFailure = true;
      continue;
    }
    if (obs.providerRequestStatus !== 'SUCCESS' && obs.rawRowCount === 0) {
      sawFailure = true;
      continue;
    }
    const present = obs.uniqueBucketIdentities.includes(bucketIdentity);
    if (!present) continue;

    for (const age of AGE_CLASSIFIERS) {
      if (obs.scheduledAgeMs === age.ms) {
        return { classification: age.label, firstSeenAgeMs: obs.scheduledAgeMs };
      }
    }
    return { classification: 'PRESENT_AT_FIRST_SUCCESS', firstSeenAgeMs: obs.scheduledAgeMs };
  }

  if (sawFailure && byAge.length > 0) {
    return { classification: 'QUERY_OBSERVATION_FAILURE', firstSeenAgeMs: null };
  }
  return { classification: 'NEVER_SEEN_BY_600', firstSeenAgeMs: null };
}

export function buildGapSettlementMatrix(args: {
  phaseLabel: string;
  nativeTemporalBucketStarts: string[];
  minGapMs: number;
  primaryField: string;
  probes: SettlementProbeRef[];
  observationsByProbeId: Record<string, SettlementObservationRef[]>;
}): GapSettlementRow[] {
  const gaps = extractNativeTemporalGaps({
    phaseLabel: args.phaseLabel,
    nativeTemporalBucketStarts: args.nativeTemporalBucketStarts,
    minGapMs: args.minGapMs,
  });

  const rows: GapSettlementRow[] = [];
  for (const gap of gaps) {
    const interiors = expectedInteriorTemporalBuckets(gap);
    const identities = interiorBucketIdentities(interiors, args.primaryField);
    const gapStartMs = Date.parse(gap.gapStartIso);
    const gapEndMs = Date.parse(gap.gapEndIso);

    for (let i = 0; i < identities.length; i++) {
      const interiorBucketIdentity = identities[i];
      const interiorTemporalIso = interiors[i];
      const probe = findSettlementProbeCoveringInterval(args.probes, gapStartMs, gapEndMs);

      if (!probe) {
        rows.push({
          phaseLabel: args.phaseLabel,
          gapStartIso: gap.gapStartIso,
          gapEndIso: gap.gapEndIso,
          gapDurationMs: gap.gapDurationMs,
          interiorBucketIdentity,
          interiorTemporalIso,
          overlappingProbeId: null,
          overlapClassification: 'NOT_ASSESSABLE_NO_OVERLAPPING_SETTLEMENT_PROBE',
          settlementClassification: 'NOT_ASSESSABLE',
          firstSeenAgeMs: null,
          gapKind: 'LIVE_POLL_CADENCE_GAP',
        });
        continue;
      }

      const observations = args.observationsByProbeId[probe.probeId] ?? [];
      const { classification, firstSeenAgeMs } = classifyFirstSeenAge(
        interiorBucketIdentity,
        observations,
      );

      rows.push({
        phaseLabel: args.phaseLabel,
        gapStartIso: gap.gapStartIso,
        gapEndIso: gap.gapEndIso,
        gapDurationMs: gap.gapDurationMs,
        interiorBucketIdentity,
        interiorTemporalIso,
        overlappingProbeId: probe.probeId,
        overlapClassification: 'EXACT_PROBE_COVERED',
        settlementClassification: classification,
        firstSeenAgeMs,
        gapKind: 'LIVE_POLL_CADENCE_GAP',
      });
    }
  }
  return rows;
}

export function summarizeGapSettlementMatrix(rows: GapSettlementRow[]): {
  nativeGapsTotal: number;
  nativeGapsExactlySettlementComparable: number;
  nativeGapsNotAssessableNoOverlap: number;
  liveMissingBucketsTotal: number;
  liveMissingBucketsRecoveredLater: number;
  liveMissingBucketsNeverSeenBy600: number;
  liveMissingBucketsUnknown: number;
} {
  const gapKeys = new Set(rows.map((r) => `${r.gapStartIso}|${r.gapEndIso}`));
  const comparableGaps = new Set(
    rows
      .filter((r) => r.overlapClassification === 'EXACT_PROBE_COVERED')
      .map((r) => `${r.gapStartIso}|${r.gapEndIso}`),
  );
  const noOverlapGaps = new Set(
    rows
      .filter((r) => r.overlapClassification === 'NOT_ASSESSABLE_NO_OVERLAPPING_SETTLEMENT_PROBE')
      .map((r) => `${r.gapStartIso}|${r.gapEndIso}`),
  );

  const recovered = rows.filter(
    (r) =>
      r.overlapClassification === 'EXACT_PROBE_COVERED' &&
      r.settlementClassification.startsWith('FIRST_SEEN_AT_'),
  );
  const neverSeen = rows.filter(
    (r) => r.settlementClassification === 'NEVER_SEEN_BY_600',
  );
  const unknown = rows.filter(
    (r) =>
      r.settlementClassification === 'NOT_ASSESSABLE' ||
      r.settlementClassification === 'QUERY_OBSERVATION_FAILURE',
  );

  return {
    nativeGapsTotal: gapKeys.size,
    nativeGapsExactlySettlementComparable: comparableGaps.size,
    nativeGapsNotAssessableNoOverlap: noOverlapGaps.size,
    liveMissingBucketsTotal: rows.length,
    liveMissingBucketsRecoveredLater: recovered.length,
    liveMissingBucketsNeverSeenBy600: neverSeen.length,
    liveMissingBucketsUnknown: unknown.length,
  };
}
