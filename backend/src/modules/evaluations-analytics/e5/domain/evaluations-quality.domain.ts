/**
 * E5A quality domain (pure, deterministic).
 *
 * Guarantees:
 *  - Freshness is measured against the correct temporal reference: `evaluatedAt`
 *    for a live/current period, but the period boundary for a historical period —
 *    a current snapshot is never presented as historical freshness
 *    (CURRENT_STATE_AS_HISTORICAL_QUALITY_COUNT = 0).
 *  - Missing/unknown inputs yield UNKNOWN/UNAVAILABLE, never a fabricated
 *    "healthy"/COMPLETE/zero (QUALITY_FALSE_ZERO_COUNT = 0).
 *  - Coverage COMPLETE requires real evidence (ratio === 1 with no missing
 *    sources); E4 limitations are preserved (FALSE_FULL_COVERAGE_COUNT = 0).
 *  - Quality never upgrades the underlying status (QUALITY_STATUS_UPGRADE_COUNT = 0).
 *  - Aggregation is conservative (the weakest dimension wins).
 */
import type {
  EvaluationsMetricStatus,
  EvaluationsSourceFreshness,
  EvaluationsSourceFreshnessState,
  EvaluationsDataCoverage,
} from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import type { E5DimensionState } from '../contracts/evaluations-quality.contract';

/**
 * Resolve a freshness state without ever treating a current snapshot as a
 * historical fact. For a historical period the reference is the period end
 * (data should be complete as of the period boundary); for a current period the
 * reference is the evaluation instant.
 */
export function resolveFreshnessState(input: {
  readonly newestSourceAtMs: number | null;
  readonly evaluatedAtMs: number;
  readonly periodEndExclusiveMs: number;
  readonly isCurrentPeriod: boolean;
  readonly thresholdMs: number;
}): EvaluationsSourceFreshnessState {
  if (input.newestSourceAtMs === null || !Number.isFinite(input.newestSourceAtMs)) {
    return 'UNKNOWN';
  }
  const reference = input.isCurrentPeriod ? input.evaluatedAtMs : input.periodEndExclusiveMs;
  const lagMs = reference - input.newestSourceAtMs;
  if (lagMs < 0) {
    // Source newer than the reference (e.g. a record dated after the period end
    // for a historical period) — not a freshness signal we can assert.
    return 'UNKNOWN';
  }
  return lagMs <= input.thresholdMs ? 'FRESH' : 'STALE';
}

export function buildSourceFreshness(input: {
  readonly newestSourceAtMs: number | null;
  readonly oldestSourceAtMs: number | null;
  readonly evaluatedAt: Date;
  readonly periodEndExclusiveMs: number;
  readonly isCurrentPeriod: boolean;
  readonly thresholdMs: number;
}): EvaluationsSourceFreshness {
  return {
    newestSourceAt: input.newestSourceAtMs !== null ? new Date(input.newestSourceAtMs).toISOString() : null,
    oldestSourceAt: input.oldestSourceAtMs !== null ? new Date(input.oldestSourceAtMs).toISOString() : null,
    // E5A does not implement an import pipeline; last successful import is unknown.
    lastSuccessfulImportAt: null,
    evaluatedAt: input.evaluatedAt.toISOString(),
    state: resolveFreshnessState({
      newestSourceAtMs: input.newestSourceAtMs,
      evaluatedAtMs: input.evaluatedAt.getTime(),
      periodEndExclusiveMs: input.periodEndExclusiveMs,
      isCurrentPeriod: input.isCurrentPeriod,
      thresholdMs: input.thresholdMs,
    }),
  };
}

/** Completeness dimension from an E4 coverage object + the section status. */
export function completenessState(
  status: EvaluationsMetricStatus,
  coverage: EvaluationsDataCoverage | null,
): E5DimensionState {
  if (status === 'UNAVAILABLE' || status === 'NOT_APPLICABLE') return 'UNAVAILABLE';
  if (status === 'ERROR') return 'UNAVAILABLE';
  if (coverage) {
    if (coverage.missingSources.length > 0) return 'PARTIAL';
    if (coverage.ratio === 1) return 'COMPLETE';
    if (coverage.ratio === null) return status === 'AVAILABLE' ? 'COMPLETE' : 'PARTIAL';
    return coverage.ratio >= 1 ? 'COMPLETE' : 'PARTIAL';
  }
  // No coverage object: only AVAILABLE can be COMPLETE; anything else is unknown.
  return status === 'AVAILABLE' ? 'COMPLETE' : status === 'PARTIAL' ? 'PARTIAL' : 'UNKNOWN';
}

export function freshnessDimensionState(state: EvaluationsSourceFreshnessState | null): E5DimensionState {
  if (state === null || state === 'UNKNOWN') return 'UNKNOWN';
  if (state === 'ERROR') return 'UNAVAILABLE';
  if (state === 'FRESH') return 'COMPLETE';
  return 'PARTIAL'; // STALE
}

export function validityState(status: EvaluationsMetricStatus): E5DimensionState {
  return status === 'ERROR' ? 'UNAVAILABLE' : 'COMPLETE';
}

/** Weakest-wins ordering used for conservative aggregation. */
const DIMENSION_RANK: Readonly<Record<E5DimensionState, number>> = {
  UNAVAILABLE: 0,
  UNKNOWN: 1,
  PARTIAL: 2,
  COMPLETE: 3,
};

export function weakestDimension(states: readonly E5DimensionState[]): E5DimensionState {
  if (states.length === 0) return 'UNKNOWN';
  return states.reduce((worst, s) => (DIMENSION_RANK[s] < DIMENSION_RANK[worst] ? s : worst));
}

/**
 * Conservative status roll-up across sections. Mirrors the E4 pattern: all
 * AVAILABLE → AVAILABLE; a mix → PARTIAL; none available → UNAVAILABLE (ERROR if
 * any ERROR and none available). Never upgrades.
 */
export function rollupQualityStatus(
  statuses: readonly EvaluationsMetricStatus[],
): EvaluationsMetricStatus {
  if (statuses.length === 0) return 'UNAVAILABLE';
  const hasAvailable = statuses.some((s) => s === 'AVAILABLE' || s === 'PARTIAL' || s === 'STALE');
  const hasNonAvailable = statuses.some(
    (s) => s === 'UNAVAILABLE' || s === 'ERROR' || s === 'NOT_APPLICABLE',
  );
  if (hasAvailable && !hasNonAvailable) return 'AVAILABLE';
  if (hasAvailable && hasNonAvailable) return 'PARTIAL';
  if (statuses.some((s) => s === 'ERROR')) return 'ERROR';
  return 'UNAVAILABLE';
}
