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
 * E5.1A: pipeline/data freshness for the current E5 sources is UNKNOWN — there is
 * no authoritative ingestion/observation/sync watermark on current main, and
 * business-event recency must NEVER be presented as freshness. `newestSourceAt`
 * here would mean an ingestion watermark, which we do not have, so it stays null.
 */
export function buildUnknownFreshness(evaluatedAt: Date): EvaluationsSourceFreshness {
  return {
    newestSourceAt: null,
    oldestSourceAt: null,
    lastSuccessfulImportAt: null,
    evaluatedAt: evaluatedAt.toISOString(),
    state: 'UNKNOWN',
  };
}

/**
 * Composite provenance: COMPLETE only when every declared required source class
 * is actually present (has traceable evidence). Never COMPLETE merely because one
 * source (lineage.length > 0) exists.
 */
export function provenanceState(input: {
  readonly served: boolean;
  readonly requiredClasses: readonly string[];
  readonly presentClasses: readonly string[];
}): E5DimensionState {
  if (!input.served) return 'UNAVAILABLE';
  if (input.requiredClasses.length === 0) return 'UNKNOWN';
  const present = new Set(input.presentClasses);
  const missing = input.requiredClasses.filter((c) => !present.has(c));
  if (missing.length === 0) return 'COMPLETE';
  if (present.size === 0) return 'UNKNOWN';
  return 'PARTIAL';
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
    // E5.2: a null ratio means the expected baseline is unknown, so completeness
    // cannot be affirmed — report UNKNOWN rather than fabricating COMPLETE from a
    // served status.
    if (coverage.ratio === null) return 'UNKNOWN';
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

/**
 * E5.2 — VALIDITY is an affirmative-evidence dimension: it must reflect proof that
 * a served result is structurally/domain valid, NOT merely that a metric was
 * served (absence of error is not validity).
 *
 *  - ERROR / UNAVAILABLE / NOT_APPLICABLE → UNAVAILABLE (no valid result to attest).
 *  - AVAILABLE / PARTIAL / STALE → UNKNOWN. E5 has no independent structural/domain
 *    validity authority on current main; served data may still be structurally
 *    valid, but we have no evidence of it, so we report UNKNOWN rather than a
 *    fabricated COMPLETE. If a validity authority is later introduced, this is the
 *    single place to attest COMPLETE from that evidence.
 */
export function validityState(status: EvaluationsMetricStatus): E5DimensionState {
  if (status === 'ERROR' || status === 'UNAVAILABLE' || status === 'NOT_APPLICABLE') {
    return 'UNAVAILABLE';
  }
  return 'UNKNOWN';
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
 * Conservative status roll-up. It NEVER upgrades: the result is AVAILABLE only
 * when every input is AVAILABLE. Any PARTIAL/STALE (or a mix with any usable
 * status) yields PARTIAL; only when nothing is usable does it fall to
 * UNAVAILABLE/ERROR. This forbids AVAILABLE+PARTIAL→AVAILABLE,
 * PARTIAL+PARTIAL→AVAILABLE, and AVAILABLE+STALE→AVAILABLE.
 */
export function rollupQualityStatus(
  statuses: readonly EvaluationsMetricStatus[],
): EvaluationsMetricStatus {
  if (statuses.length === 0) return 'UNAVAILABLE';
  // Uniform status → itself (e.g. all AVAILABLE, all STALE, all UNAVAILABLE).
  if (statuses.every((s) => s === statuses[0])) return statuses[0];

  const hasAvailable = statuses.some((s) => s === 'AVAILABLE');
  const hasWeak = statuses.some((s) => s === 'PARTIAL' || s === 'STALE');
  // Any mix that still has usable evidence but is not uniformly AVAILABLE → PARTIAL.
  if (hasAvailable || hasWeak) return 'PARTIAL';
  if (statuses.some((s) => s === 'ERROR')) return 'ERROR';
  return 'UNAVAILABLE';
}
