/**
 * Calculation versions for registry metricIds — shared between backend registry and client provenance builders.
 * When a formula changes, bump the metric's version here AND in `evaluations-metric.definitions.ts`.
 * Backend tests verify both stay in sync.
 */

export const EVALUATIONS_INITIAL_CALCULATION_VERSION = '1.0.0' as const;

/** Canonical registry id prefixes (aligned with evaluations-kpi-taxonomy.md). */
const REGISTRY_METRIC_ID_PREFIXES = ['fin.', 'ins.', 'ops.', 'da.', 'fc.'] as const;

/** Per-metric overrides when formulas diverge from the initial version. */
export const EVALUATIONS_METRIC_CALCULATION_VERSION_OVERRIDES: Readonly<Record<string, string>> = {
  // Example when a formula changes:
  // 'fin.mtd_issued_revenue': '2.0.0',
};

/**
 * Resolves the semver calculation version for a registry metricId.
 * Throws when the id is unknown — callers must use canonical registry ids only.
 */
export function resolveEvaluationsMetricCalculationVersion(metricId: string): string {
  const override = EVALUATIONS_METRIC_CALCULATION_VERSION_OVERRIDES[metricId];
  if (override) return override;
  if (isRegisteredEvaluationsMetricId(metricId)) {
    return EVALUATIONS_INITIAL_CALCULATION_VERSION;
  }
  throw new Error(`Unknown evaluations metric id: ${metricId}`);
}

/** Lightweight id check for client-side provenance builders. */
export function isRegisteredEvaluationsMetricId(metricId: string): boolean {
  return REGISTRY_METRIC_ID_PREFIXES.some((prefix) => metricId.startsWith(prefix));
}
