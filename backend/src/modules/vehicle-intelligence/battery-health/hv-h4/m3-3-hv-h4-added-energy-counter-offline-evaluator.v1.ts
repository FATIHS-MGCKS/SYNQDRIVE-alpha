/**
 * Pure offline scientific evaluator for DIMO-style minute-bucket added-energy counters.
 * No I/O. Does not establish production provenance or trusted source authority.
 */

export const M3_3_HV_H4_ADDED_ENERGY_COUNTER_OFFLINE_LABELS_V1 = {
  COUNTER_OBSERVATIONS_AVAILABLE: 'COUNTER_OBSERVATIONS_AVAILABLE',
  CANDIDATE_DELTA_CONTEXT_ONLY: 'CANDIDATE_DELTA_CONTEXT_ONLY',
  INSUFFICIENT_BOUNDARY_COVERAGE: 'INSUFFICIENT_BOUNDARY_COVERAGE',
  RESET_OR_DISCONTINUITY: 'RESET_OR_DISCONTINUITY',
  AMBIGUOUS_AGGREGATION: 'AMBIGUOUS_AGGREGATION',
  SCIENTIFIC_AUTHORITY_NOT_ESTABLISHED: 'SCIENTIFIC_AUTHORITY_NOT_ESTABLISHED',
} as const;

export type M3_3HvH4AddedEnergyCounterOfflineLabelV1 =
  (typeof M3_3_HV_H4_ADDED_ENERGY_COUNTER_OFFLINE_LABELS_V1)[keyof typeof M3_3_HV_H4_ADDED_ENERGY_COUNTER_OFFLINE_LABELS_V1];

export type M3_3HvH4AddedEnergyCounterBucketAggregationV1 = 'LAST' | 'MIN' | 'MAX';

export interface M3_3HvH4AddedEnergyCounterBucketObservationV1 {
  timestamp: string;
  valueKwh: number | null;
  minKwh?: number | null;
  maxKwh?: number | null;
}

export interface M3_3HvH4AddedEnergyCounterOfflineEvaluationInputV1 {
  signalId: string;
  unit: 'kWh';
  bucketWidth: string;
  aggregation: M3_3HvH4AddedEnergyCounterBucketAggregationV1;
  aggregationSemantics: string;
  episodeStartInclusive: string;
  episodeEndInclusive: string;
  observations: M3_3HvH4AddedEnergyCounterBucketObservationV1[];
  /** Drop threshold (kWh) between consecutive in-window observations treated as discontinuity. */
  discontinuityDropKwh?: number;
  requirePreEpisodeBaseline?: boolean;
  requirePostEpisodeObservation?: boolean;
}

export interface M3_3HvH4AddedEnergyCounterOfflineEvaluationV1 {
  labels: M3_3HvH4AddedEnergyCounterOfflineLabelV1[];
  observationCount: number;
  inEpisodeObservationCount: number;
  duplicateTimestampCount: number;
  conflictingDuplicateCount: number;
  missingInEpisodeBucketCount: number;
  preEpisodeBaselineKwh: number | null;
  firstInEpisodeKwh: number | null;
  lastInEpisodeKwh: number | null;
  absoluteLastInEpisodeKwh: number | null;
  candidateDeltaFromFirstLastKwh: number | null;
  candidateDeltaFromPreBaselineKwh: number | null;
  intraBucketMinMaxSpreadCount: number;
  negativeStepCount: number;
  discontinuityCount: number;
  limitations: string[];
}

function parseInstant(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function evaluateM3_3HvH4AddedEnergyCounterOfflineV1(
  input: M3_3HvH4AddedEnergyCounterOfflineEvaluationInputV1,
): M3_3HvH4AddedEnergyCounterOfflineEvaluationV1 {
  const labels: M3_3HvH4AddedEnergyCounterOfflineLabelV1[] = [];
  const limitations: string[] = [
    'Minute-bucket aggregates are not raw source samples.',
    'Absence of observed resets does not prove reset-free behavior inside buckets.',
  ];

  const episodeStartMs = parseInstant(input.episodeStartInclusive);
  const episodeEndMs = parseInstant(input.episodeEndInclusive);
  if (episodeStartMs == null || episodeEndMs == null || episodeEndMs < episodeStartMs) {
    return {
      labels: [
        M3_3_HV_H4_ADDED_ENERGY_COUNTER_OFFLINE_LABELS_V1.INSUFFICIENT_BOUNDARY_COVERAGE,
        M3_3_HV_H4_ADDED_ENERGY_COUNTER_OFFLINE_LABELS_V1.SCIENTIFIC_AUTHORITY_NOT_ESTABLISHED,
      ],
      observationCount: 0,
      inEpisodeObservationCount: 0,
      duplicateTimestampCount: 0,
      conflictingDuplicateCount: 0,
      missingInEpisodeBucketCount: 0,
      preEpisodeBaselineKwh: null,
      firstInEpisodeKwh: null,
      lastInEpisodeKwh: null,
      absoluteLastInEpisodeKwh: null,
      candidateDeltaFromFirstLastKwh: null,
      candidateDeltaFromPreBaselineKwh: null,
      intraBucketMinMaxSpreadCount: 0,
      negativeStepCount: 0,
      discontinuityCount: 0,
      limitations: [...limitations, 'Invalid episode boundary instants.'],
    };
  }

  const dropThreshold = input.discontinuityDropKwh ?? 0.05;
  const byTimestamp = new Map<string, M3_3HvH4AddedEnergyCounterBucketObservationV1[]>();
  let invalidValueCount = 0;

  for (const row of input.observations) {
    if (!row.timestamp) continue;
    const list = byTimestamp.get(row.timestamp) ?? [];
    list.push(row);
    byTimestamp.set(row.timestamp, list);
    if (row.valueKwh != null && !isFiniteNumber(row.valueKwh)) invalidValueCount++;
  }

  const duplicateTimestampCount = [...byTimestamp.values()].filter((v) => v.length > 1).length;
  let conflictingDuplicateCount = 0;
  const normalized: M3_3HvH4AddedEnergyCounterBucketObservationV1[] = [];
  for (const [timestamp, rows] of byTimestamp.entries()) {
    const values = rows.map((r) => r.valueKwh).filter(isFiniteNumber);
    const unique = [...new Set(values.map((v) => v.toFixed(6)))];
    if (unique.length > 1) {
      conflictingDuplicateCount++;
      limitations.push(`Conflicting duplicate values at ${timestamp}.`);
      continue;
    }
    const pick = rows[0];
    normalized.push({
      timestamp,
      valueKwh: pick.valueKwh,
      minKwh: pick.minKwh,
      maxKwh: pick.maxKwh,
    });
  }

  normalized.sort((a, b) => (parseInstant(a.timestamp) ?? 0) - (parseInstant(b.timestamp) ?? 0));

  const withValue = normalized.filter((r) => isFiniteNumber(r.valueKwh));
  if (withValue.length > 0) {
    labels.push(M3_3_HV_H4_ADDED_ENERGY_COUNTER_OFFLINE_LABELS_V1.COUNTER_OBSERVATIONS_AVAILABLE);
  }

  let intraBucketMinMaxSpreadCount = 0;
  for (const row of withValue) {
    if (isFiniteNumber(row.minKwh) && isFiniteNumber(row.maxKwh)) {
      if (Math.abs(row.maxKwh - row.minKwh) > 0.001) intraBucketMinMaxSpreadCount++;
    }
  }
  if (intraBucketMinMaxSpreadCount > 0) {
    labels.push(M3_3_HV_H4_ADDED_ENERGY_COUNTER_OFFLINE_LABELS_V1.AMBIGUOUS_AGGREGATION);
    limitations.push('Intra-bucket MIN/MAX spread observed; internal bucket behavior is hidden.');
  }

  const inEpisode = withValue.filter((r) => {
    const t = parseInstant(r.timestamp);
    return t != null && t >= episodeStartMs && t <= episodeEndMs;
  });
  const preEpisode = withValue.filter((r) => {
    const t = parseInstant(r.timestamp);
    return t != null && t < episodeStartMs;
  });
  const postEpisode = withValue.filter((r) => {
    const t = parseInstant(r.timestamp);
    return t != null && t > episodeEndMs;
  });

  const preEpisodeBaselineKwh =
    preEpisode.length > 0 ? preEpisode[preEpisode.length - 1].valueKwh : null;
  const firstInEpisode = inEpisode[0] ?? null;
  const lastInEpisode = inEpisode[inEpisode.length - 1] ?? null;

  let negativeStepCount = 0;
  let discontinuityCount = 0;
  for (let i = 1; i < inEpisode.length; i++) {
    const prev = inEpisode[i - 1].valueKwh!;
    const cur = inEpisode[i].valueKwh!;
    if (cur < prev) negativeStepCount++;
    if (cur < prev - dropThreshold) discontinuityCount++;
  }

  if (negativeStepCount > 0 || discontinuityCount > 0) {
    labels.push(M3_3_HV_H4_ADDED_ENERGY_COUNTER_OFFLINE_LABELS_V1.RESET_OR_DISCONTINUITY);
  }

  const expectedMinuteBuckets = Math.floor((episodeEndMs - episodeStartMs) / 60_000) + 1;
  const missingInEpisodeBucketCount = Math.max(0, expectedMinuteBuckets - inEpisode.length);

  const requirePre = input.requirePreEpisodeBaseline ?? true;
  const requirePost = input.requirePostEpisodeObservation ?? false;
  if (
    inEpisode.length === 0 ||
    (requirePre && preEpisodeBaselineKwh == null) ||
    (requirePost && postEpisode.length === 0) ||
    missingInEpisodeBucketCount > expectedMinuteBuckets * 0.15
  ) {
    labels.push(M3_3_HV_H4_ADDED_ENERGY_COUNTER_OFFLINE_LABELS_V1.INSUFFICIENT_BOUNDARY_COVERAGE);
  }

  let candidateDeltaFromFirstLastKwh: number | null = null;
  let candidateDeltaFromPreBaselineKwh: number | null = null;
  if (firstInEpisode && lastInEpisode) {
    candidateDeltaFromFirstLastKwh = lastInEpisode.valueKwh! - firstInEpisode.valueKwh!;
    labels.push(M3_3_HV_H4_ADDED_ENERGY_COUNTER_OFFLINE_LABELS_V1.CANDIDATE_DELTA_CONTEXT_ONLY);
  }
  if (preEpisodeBaselineKwh != null && lastInEpisode) {
    candidateDeltaFromPreBaselineKwh = lastInEpisode.valueKwh! - preEpisodeBaselineKwh;
    labels.push(M3_3_HV_H4_ADDED_ENERGY_COUNTER_OFFLINE_LABELS_V1.CANDIDATE_DELTA_CONTEXT_ONLY);
  }

  if (invalidValueCount > 0 || conflictingDuplicateCount > 0) {
    labels.push(M3_3_HV_H4_ADDED_ENERGY_COUNTER_OFFLINE_LABELS_V1.SCIENTIFIC_AUTHORITY_NOT_ESTABLISHED);
  }

  labels.push(M3_3_HV_H4_ADDED_ENERGY_COUNTER_OFFLINE_LABELS_V1.SCIENTIFIC_AUTHORITY_NOT_ESTABLISHED);

  const uniqueLabels = [...new Set(labels)];

  return {
    labels: uniqueLabels,
    observationCount: withValue.length,
    inEpisodeObservationCount: inEpisode.length,
    duplicateTimestampCount,
    conflictingDuplicateCount,
    missingInEpisodeBucketCount,
    preEpisodeBaselineKwh,
    firstInEpisodeKwh: firstInEpisode?.valueKwh ?? null,
    lastInEpisodeKwh: lastInEpisode?.valueKwh ?? null,
    absoluteLastInEpisodeKwh: lastInEpisode?.valueKwh ?? null,
    candidateDeltaFromFirstLastKwh,
    candidateDeltaFromPreBaselineKwh,
    intraBucketMinMaxSpreadCount,
    negativeStepCount,
    discontinuityCount,
    limitations,
  };
}
