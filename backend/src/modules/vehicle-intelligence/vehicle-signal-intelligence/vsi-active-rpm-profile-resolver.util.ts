import { createHash } from 'node:crypto';
import {
  assignPointsToFirstTrip,
  collectIntraTripIntervalsSeconds,
  dedupeSortedTimestampsMs,
  medianSeconds,
  percentileSeconds,
  VSI_CADENCE_MIN_INTERVAL_SAMPLES,
} from './vsi-profile-cadence-stats.util';
import { buildCadenceSemanticFingerprint } from './vsi-profile-cadence-stats.util';
import type {
  VsiActiveRpmProfileLabel,
  VsiActiveRpmProfileResolutionV1,
  VsiRpmCadenceEvidenceInput,
  VsiRpmCadenceTripWindow,
  VsiSignalCadenceIntelligenceV2,
} from './vsi-profile-cadence.types';

export const VSI_ACTIVE_RPM_PROFILE_CONTRACT_VERSION = 'vsi-active-rpm-profile-v1' as const;

export type { VsiActiveRpmProfileLabel, VsiActiveRpmProfileResolutionV1 };

/** Upper bound for dense ~1–2 s spacing medians (not a native Hz claim). */
export const VSI_ACTIVE_RPM_FAST_MEDIAN_MAX_SECONDS = 2;
/** Audi-aligned sparse R1 median band (production replay P25 ≈ 3 s). */
export const VSI_ACTIVE_RPM_SPARSE_MEDIAN_MIN_SECONDS = 3;
/** P95 at or above this with sub-3 s median indicates sparse gaps, not fast 1 Hz. */
export const VSI_ACTIVE_RPM_SPARSE_P95_MIN_SECONDS = 8;
export const VSI_ACTIVE_RPM_FAST_P95_MAX_SECONDS = 5;
export const VSI_ACTIVE_RPM_FAST_FRACTION_LE2_MIN = 0.7;
export const VSI_ACTIVE_RPM_MIN_POINTS_PER_TRIP = 10;
export const VSI_ACTIVE_RPM_ROLLING_TRIP_MIN = 3;
export const VSI_ACTIVE_RPM_ROLLING_TRIP_MAX = 5;
export const VSI_ACTIVE_RPM_AGREEMENT_RATIO = 2 / 3;

export type VsiActiveRpmTripClassification = {
  tripId: string;
  endMs: number;
  profile: VsiActiveRpmProfileLabel;
  intervalMedianSeconds: number | null;
  intervalP95Seconds: number | null;
  intervalCount: number;
  rpmPointCount: number;
  fractionIntervalsLe2s: number | null;
  decisionCode: string;
};

function hashProfileSemantic(payload: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function sortTripWindowsChronological(
  trips: readonly VsiRpmCadenceTripWindow[],
): VsiRpmCadenceTripWindow[] {
  return [...trips].sort((a, b) => a.endMs - b.endMs);
}

/** Most recent finalized trips for active-profile selection (no 14 d pooling). */
export function selectRollingCadenceTripWindows(
  trips: readonly VsiRpmCadenceTripWindow[],
  maxTrips = VSI_ACTIVE_RPM_ROLLING_TRIP_MAX,
): VsiRpmCadenceTripWindow[] {
  const chronological = sortTripWindowsChronological(trips);
  if (chronological.length <= maxTrips) {
    return chronological;
  }
  return chronological.slice(-maxTrips);
}

function fractionLe(seconds: number[], threshold: number): number | null {
  if (seconds.length === 0) return null;
  return seconds.filter((s) => s <= threshold).length / seconds.length;
}

/**
 * Per-trip RPM profile from intra-trip intervals.
 * Median alone does not decide STANDARD vs 1 Hz; P95 and short-interval fraction
 * separate Tiguan sparse median≈2 s (high P95) from true ~1–2 s fast profiles.
 */
export function classifySingleTripRpmProfile(input: {
  trip: VsiRpmCadenceTripWindow;
  points: readonly { recordedAtMs: number; value: number }[];
}): VsiActiveRpmTripClassification {
  const inTrip = assignPointsToFirstTrip(
    input.points.filter((p) => Number.isFinite(p.value)),
    [input.trip],
  );
  const timestamps = dedupeSortedTimestampsMs(inTrip.map((p) => p.recordedAtMs));
  const intervals = collectIntraTripIntervalsSeconds(inTrip, [input.trip]);
  const sorted = [...intervals].sort((a, b) => a - b);
  const med = medianSeconds(intervals);
  const p95 = percentileSeconds(sorted, 95);
  const fracLe2 = fractionLe(intervals, 2);

  const base = {
    tripId: input.trip.tripId,
    endMs: input.trip.endMs,
    intervalMedianSeconds: med,
    intervalP95Seconds: p95,
    intervalCount: intervals.length,
    rpmPointCount: timestamps.length,
    fractionIntervalsLe2s: fracLe2,
  };

  if (
    timestamps.length < VSI_ACTIVE_RPM_MIN_POINTS_PER_TRIP ||
    intervals.length < VSI_CADENCE_MIN_INTERVAL_SAMPLES
  ) {
    return {
      ...base,
      profile: 'UNKNOWN',
      decisionCode: 'TRIP_EVIDENCE_THIN',
    };
  }

  if (med != null && med >= VSI_ACTIVE_RPM_SPARSE_MEDIAN_MIN_SECONDS) {
    return {
      ...base,
      profile: 'RPM_STANDARD',
      decisionCode: 'MEDIAN_GE_SPARSE_REFERENCE_BAND',
    };
  }

  if (p95 != null && p95 >= VSI_ACTIVE_RPM_SPARSE_P95_MIN_SECONDS) {
    return {
      ...base,
      profile: 'RPM_STANDARD',
      decisionCode: 'P95_SPARSE_GAP_PATTERN',
    };
  }

  if (
    med != null &&
    med >= 2 &&
    p95 != null &&
    p95 >= 10
  ) {
    return {
      ...base,
      profile: 'RPM_STANDARD',
      decisionCode: 'SUB_3S_MEDIAN_WITH_LARGE_P95_GAPS',
    };
  }

  if (
    med != null &&
    med >= 2.5 &&
    p95 != null &&
    p95 >= 6
  ) {
    return {
      ...base,
      profile: 'RPM_STANDARD',
      decisionCode: 'MID_MEDIAN_WITH_SPARSE_TAIL',
    };
  }

  const fastProfile =
    med != null &&
    med <= VSI_ACTIVE_RPM_FAST_MEDIAN_MAX_SECONDS &&
    (fracLe2 ?? 0) >= VSI_ACTIVE_RPM_FAST_FRACTION_LE2_MIN &&
    (p95 == null || p95 <= VSI_ACTIVE_RPM_FAST_P95_MAX_SECONDS);

  if (fastProfile) {
    return {
      ...base,
      profile: 'RPM_1HZ',
      decisionCode: 'FAST_1_2S_BUCKET_PATTERN',
    };
  }

  return {
    ...base,
    profile: 'UNKNOWN',
    decisionCode: 'AMBIGUOUS_OR_MIXED_SPACING',
  };
}

function requiredKnownTripsInWindow(windowSize: number): number {
  return Math.max(
    VSI_ACTIVE_RPM_ROLLING_TRIP_MIN,
    Math.ceil(windowSize * VSI_ACTIVE_RPM_AGREEMENT_RATIO),
  );
}

function resolveRollingAgreement(
  classifications: VsiActiveRpmTripClassification[],
): {
  activeProfile: VsiActiveRpmProfileLabel;
  agreementRatio: number | null;
  decisionCode: string;
  summary: string;
} {
  const windowSize = classifications.length;
  const known = classifications.filter((c) => c.profile !== 'UNKNOWN');
  const requiredKnown = requiredKnownTripsInWindow(windowSize);

  if (known.length < requiredKnown) {
    return {
      activeProfile: 'UNKNOWN',
      agreementRatio: known.length > 0 ? known.length / windowSize : null,
      decisionCode: 'INSUFFICIENT_KNOWN_TRIPS_IN_WINDOW',
      summary: `${known.length}/${windowSize} trips classifiable; need ${requiredKnown} in rolling window`,
    };
  }

  const counts: Record<VsiActiveRpmProfileLabel, number> = {
    RPM_1HZ: 0,
    RPM_STANDARD: 0,
    UNKNOWN: 0,
  };
  for (const row of known) {
    counts[row.profile] += 1;
  }

  const totalKnown = known.length;
  const candidates: VsiActiveRpmProfileLabel[] = ['RPM_1HZ', 'RPM_STANDARD'];
  let best: VsiActiveRpmProfileLabel = 'UNKNOWN';
  let bestRatio = 0;
  for (const label of candidates) {
    const ratio = counts[label] / totalKnown;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = label;
    }
  }

  if (bestRatio < VSI_ACTIVE_RPM_AGREEMENT_RATIO) {
    return {
      activeProfile: 'UNKNOWN',
      agreementRatio: bestRatio,
      decisionCode: 'CONTRADICTORY_TRIP_EVIDENCE',
      summary: 'No supermajority RPM profile across classifiable trips',
    };
  }

  return {
    activeProfile: best,
    agreementRatio: bestRatio,
    decisionCode: 'ROLLING_SUPERMAJORITY',
    summary: `${best} supported by ${counts[best]}/${totalKnown} classifiable trips (${known.length}/${windowSize} in window)`,
  };
}

/** Semantic identity only — excludes rolling trip ids (evidence provenance stays on resolution). */
export function buildActiveRpmProfileSemanticFingerprint(input: {
  activeProfile: VsiActiveRpmProfileLabel;
}): string {
  return hashProfileSemantic({
    contract: VSI_ACTIVE_RPM_PROFILE_CONTRACT_VERSION,
    activeProfile: input.activeProfile,
  });
}

/**
 * Resolves the currently valid RPM profile for the active provider source link
 * using the last 3–5 suitable completed trips (chronological), without 14 d pooling.
 */
export function resolveActiveRpmProfileV1(
  evidence: VsiRpmCadenceEvidenceInput,
): VsiActiveRpmProfileResolutionV1 | null {
  if (evidence.iceRpmApplicability !== 'APPLICABLE') {
    return null;
  }
  if (evidence.hfReadStatus !== 'SUCCESS' && evidence.points.length === 0) {
    const empty: VsiActiveRpmProfileResolutionV1 = {
      contractVersion: VSI_ACTIVE_RPM_PROFILE_CONTRACT_VERSION,
      activeProfile: 'UNKNOWN',
      evaluatedTripIds: [],
      qualifyingTripCount: 0,
      agreementRatio: null,
      classificationDecisionCode: 'HF_EVIDENCE_UNAVAILABLE',
      classificationDecisionSummary: `HF read status ${evidence.hfReadStatus}`,
      tripClassifications: [],
      profileSemanticFingerprint: buildActiveRpmProfileSemanticFingerprint({
        activeProfile: 'UNKNOWN',
      }),
    };
    return empty;
  }

  const rolling = selectRollingCadenceTripWindows(evidence.tripWindows);
  const tripClassifications = rolling.map((trip) =>
    classifySingleTripRpmProfile({ trip, points: evidence.points }),
  );
  const evaluatedTripIds = rolling.map((t) => t.tripId);
  const agreement = resolveRollingAgreement(tripClassifications);
  const qualifyingTripCount = tripClassifications.filter(
    (c) => c.profile !== 'UNKNOWN',
  ).length;

  const resolution: VsiActiveRpmProfileResolutionV1 = {
    contractVersion: VSI_ACTIVE_RPM_PROFILE_CONTRACT_VERSION,
    activeProfile: agreement.activeProfile,
    evaluatedTripIds,
    qualifyingTripCount,
    agreementRatio: agreement.agreementRatio,
    classificationDecisionCode: agreement.decisionCode,
    classificationDecisionSummary: agreement.summary,
    tripClassifications,
    profileSemanticFingerprint: buildActiveRpmProfileSemanticFingerprint({
      activeProfile: agreement.activeProfile,
    }),
  };

  return resolution;
}

function roundSecondsForSemantic(value: number | null): number | null {
  if (value == null) return null;
  return Math.round(value);
}

/** Attaches rolling active RPM profile without recomputing aggregate cadence metrics. */
export function mergeActiveRpmProfileOntoEngineRpmCadence(
  cadence: VsiSignalCadenceIntelligenceV2,
  evidence: VsiRpmCadenceEvidenceInput,
): VsiSignalCadenceIntelligenceV2 {
  const activeRpmProfile = resolveActiveRpmProfileV1(evidence);
  if (!activeRpmProfile) {
    return cadence;
  }

  const limitations = [...cadence.limitations];
  if (activeRpmProfile.activeProfile === 'UNKNOWN') {
    if (!limitations.includes('ACTIVE_RPM_PROFILE_UNRESOLVED')) {
      limitations.push('ACTIVE_RPM_PROFILE_UNRESOLVED');
    }
  }

  const cadenceSemanticFingerprint = buildCadenceSemanticFingerprint({
    signal: 'engine_rpm',
    applicability: 'APPLICABLE',
    density: cadence.observedDensityLabel,
    median: roundSecondsForSemantic(cadence.intervalMedianSeconds),
    p95: roundSecondsForSemantic(cadence.intervalP95Seconds),
    maxGap: roundSecondsForSemantic(cadence.maxIntraWindowGapSeconds),
    activeRpmProfileFingerprint: activeRpmProfile.profileSemanticFingerprint,
    regimes: cadence.regimes.map((r) => ({
      kind: r.kind,
      median: roundSecondsForSemantic(r.intervalMedianSeconds),
      p95: roundSecondsForSemantic(r.intervalP95Seconds),
      confidence: r.confidence,
    })),
  });

  return {
    ...cadence,
    limitations,
    activeRpmProfile,
    cadenceSemanticFingerprint,
  };
}

/** Build HF evidence from production replay rows (interval seconds between RPM points). */
export function buildRpmEvidenceFromIntervalReplayTrips(
  trips: readonly {
    tripId: string;
    startMs: number;
    endMs: number;
    intervalsSec: readonly number[];
  }[],
): VsiRpmCadenceEvidenceInput {
  const tripWindows: VsiRpmCadenceTripWindow[] = trips.map((t) => ({
    tripId: t.tripId,
    startMs: t.startMs,
    endMs: t.endMs,
  }));
  const points: { recordedAtMs: number; value: number }[] = [];
  for (const trip of trips) {
    let ts = trip.startMs;
    points.push({ recordedAtMs: ts, value: 1800 });
    for (const gapSec of trip.intervalsSec) {
      const nextTs = ts + gapSec * 1000;
      if (nextTs > trip.endMs) {
        break;
      }
      ts = nextTs;
      points.push({ recordedAtMs: ts, value: 1800 });
    }
  }
  return {
    iceRpmApplicability: 'APPLICABLE',
    tripWindows,
    points,
    provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS'],
    hfReadStatus: 'SUCCESS',
  };
}
