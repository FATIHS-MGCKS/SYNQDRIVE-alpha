/**
 * E4 Driver / Influence analysis domain (pure, deterministic, association-only).
 *
 * This is association / influence analysis, NOT causal inference:
 *  - relationships are labeled ASSOCIATED_WITH / CORRELATES_WITH (never "caused"),
 *    (DRIVER_CAUSAL_CLAIM_COUNT = 0),
 *  - a factor is emitted only when the per-driver sample and the dimension total
 *    clear explicit minimums (DRIVER_INSUFFICIENT_SAMPLE_RESULT_COUNT = 0),
 *  - it consumes already-computed parent evidence (attributed counts); it does
 *    NOT recompute revenue/cost/utilization (DRIVER_PARENT_KPI_REIMPLEMENTATION_
 *    COUNT = 0),
 *  - driver references are opaque org-scoped ids provided by a tenant-scoped
 *    repository; tenant isolation is enforced upstream.
 */
import type { E4DriverFactor } from '../contracts/evaluations-insights.contract';

export interface E4DriverObservationInput {
  /** Organization-scoped Customer id acting as the driver reference. */
  readonly driverRef: string;
  readonly dimension: string;
  /** Count of the observed pattern attributable to this driver (parent evidence). */
  readonly count: number;
}

export interface E4DriverInfluenceConfig {
  readonly minSampleSize: number;
  readonly minDimensionTotal: number;
  readonly topN: number;
}

export const E4_DEFAULT_DRIVER_CONFIG: E4DriverInfluenceConfig = {
  minSampleSize: 3,
  minDimensionTotal: 5,
  topN: 5,
};

export interface E4DriverInfluenceResult {
  readonly factors: readonly E4DriverFactor[];
  readonly dimensionsAnalyzed: readonly string[];
  readonly dimensionsSkippedInsufficient: readonly string[];
}

export function computeDriverInfluence(
  observations: readonly E4DriverObservationInput[],
  config: E4DriverInfluenceConfig = E4_DEFAULT_DRIVER_CONFIG,
): E4DriverInfluenceResult {
  const byDimension = new Map<string, E4DriverObservationInput[]>();
  for (const observation of observations) {
    if (observation.count <= 0) continue;
    const list = byDimension.get(observation.dimension) ?? [];
    list.push(observation);
    byDimension.set(observation.dimension, list);
  }

  const factors: E4DriverFactor[] = [];
  const dimensionsAnalyzed: string[] = [];
  const dimensionsSkippedInsufficient: string[] = [];

  for (const dimension of [...byDimension.keys()].sort()) {
    const list = byDimension.get(dimension) as E4DriverObservationInput[];
    // Aggregate per driver first (a driver may appear in multiple rows).
    const perDriver = new Map<string, number>();
    for (const observation of list) {
      perDriver.set(
        observation.driverRef,
        (perDriver.get(observation.driverRef) ?? 0) + observation.count,
      );
    }
    const total = [...perDriver.values()].reduce((acc, value) => acc + value, 0);
    if (total < config.minDimensionTotal) {
      dimensionsSkippedInsufficient.push(dimension);
      continue;
    }
    dimensionsAnalyzed.push(dimension);

    const eligible = [...perDriver.entries()]
      .filter(([, count]) => count >= config.minSampleSize)
      .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0] < b[0] ? -1 : 1))
      .slice(0, config.topN);

    for (const [driverRef, count] of eligible) {
      factors.push({
        driverRef,
        associatedDimension: dimension,
        associationShare: count / total,
        sampleSize: count,
        relationship: 'ASSOCIATED_WITH',
      });
    }
  }

  return {
    factors,
    dimensionsAnalyzed,
    dimensionsSkippedInsufficient,
  };
}
