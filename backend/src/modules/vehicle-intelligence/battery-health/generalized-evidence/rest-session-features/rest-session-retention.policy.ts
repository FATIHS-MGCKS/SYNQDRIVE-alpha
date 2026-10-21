import type {
  RestSessionRetentionAnchorInput,
  RestSessionRetentionCandidateInput,
  RestSessionRetentionFeatures,
  RestSessionRetentionEligiblePoint,
} from './rest-session-retention.types';
import {
  resolveRestSessionRetentionAnchorVoltageMv,
  selectRestSessionRetentionEligiblePoints,
} from './rest-session-retention-eligibility.policy';
import {
  computeTheilSenRestSlopeMvPerHour,
  deterministicMedianInt,
  populationVariance,
} from './rest-session-retention-theil-sen.policy';

/**
 * Count positive nominal rungs absent between 1 and max represented index.
 * Index 0 is not a missing wake rung. Returns null when no positive nominal metadata.
 */
export function computeMissingNominalRungCount(
  points: RestSessionRetentionEligiblePoint[],
): number | null {
  const positiveIndices = points
    .map((p) => p.nominalRestIntervalIndex)
    .filter((idx): idx is number => idx != null && idx >= 1);
  if (positiveIndices.length === 0) return null;
  const maxIndex = Math.max(...positiveIndices);
  const present = new Set(positiveIndices);
  let missing = 0;
  for (let i = 1; i <= maxIndex; i += 1) {
    if (!present.has(i)) missing += 1;
  }
  return missing;
}

/**
 * Pairwise nominal rung deltas when exactly one observation per rung.
 * Key format: "{earlierIndex}->{laterIndex}" value: laterMv - earlierMv.
 */
export function computePairwiseNominalRungDeltas(
  points: RestSessionRetentionEligiblePoint[],
): Record<string, number> | null {
  const byIndex = new Map<number, RestSessionRetentionEligiblePoint>();
  for (const point of points) {
    if (point.nominalRestIntervalIndex == null || point.nominalRestIntervalIndex < 1) {
      continue;
    }
    const idx = point.nominalRestIntervalIndex;
    if (byIndex.has(idx)) {
      return null;
    }
    byIndex.set(idx, point);
  }
  if (byIndex.size < 2) return null;

  const indices = [...byIndex.keys()].sort((a, b) => a - b);
  const deltas: Record<string, number> = {};
  for (let i = 0; i < indices.length - 1; i += 1) {
    const earlier = indices[i];
    const later = indices[i + 1];
    const earlierPoint = byIndex.get(earlier)!;
    const laterPoint = byIndex.get(later)!;
    deltas[`${earlier}->${later}`] = laterPoint.voltageMv - earlierPoint.voltageMv;
  }
  return deltas;
}

export function computeRestSessionRetentionFeatures(input: {
  restSessionId: string;
  anchor: RestSessionRetentionAnchorInput | null;
  candidates: RestSessionRetentionCandidateInput[];
}): RestSessionRetentionFeatures {
  // RETENTION_TIME_AUTHORITY=actualRestAgeMs only (no ingest/gap recalculation in C1).
  const eligible = selectRestSessionRetentionEligiblePoints({
    restSessionId: input.restSessionId,
    candidates: input.candidates,
  });

  const anchorMv =
    input.anchor != null
      ? resolveRestSessionRetentionAnchorVoltageMv(
          input.restSessionId,
          input.anchor,
        )
      : null;
  const count = eligible.length;

  if (count === 0) {
    return {
      shutdownToFirstRestDeltaMv: null,
      robustRestSlopeMvPerHour: null,
      minimumRestVoltageMv: null,
      maximumRestVoltageMv: null,
      medianRestVoltageMv: null,
      restVoltageVarianceMv2: null,
      numberOfValidRestPoints: 0,
      maxActualRestAgeMs: null,
      maxInterObservationGapMs: null,
      observationSpanMs: null,
      missingRungCount: computeMissingNominalRungCount(eligible),
      pairwiseRestDeltas: computePairwiseNominalRungDeltas(eligible),
    };
  }

  const voltages = eligible.map((p) => p.voltageMv);
  const ages = eligible.map((p) => p.actualRestAgeMs);

  let maxInterGap: number | null = null;
  if (count >= 2) {
    maxInterGap = 0;
    for (let i = 1; i < ages.length; i += 1) {
      const gap = ages[i] - ages[i - 1];
      if (gap > maxInterGap) maxInterGap = gap;
    }
  }

  const observationSpanMs = count >= 2 ? ages[ages.length - 1] - ages[0] : 0;

  const shutdownToFirstRestDeltaMv =
    anchorMv != null ? anchorMv - eligible[0].voltageMv : null;

  return {
    shutdownToFirstRestDeltaMv,
    robustRestSlopeMvPerHour: computeTheilSenRestSlopeMvPerHour(eligible),
    minimumRestVoltageMv: Math.min(...voltages),
    maximumRestVoltageMv: Math.max(...voltages),
    medianRestVoltageMv: deterministicMedianInt(voltages),
    restVoltageVarianceMv2: populationVariance(voltages),
    numberOfValidRestPoints: count,
    maxActualRestAgeMs: Math.max(...ages),
    maxInterObservationGapMs: maxInterGap,
    observationSpanMs,
    missingRungCount: computeMissingNominalRungCount(eligible),
    pairwiseRestDeltas: computePairwiseNominalRungDeltas(eligible),
  };
}
