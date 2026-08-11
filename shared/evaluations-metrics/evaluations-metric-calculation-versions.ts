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
  // E3.1 material finance semantic changes (see
  // docs/audits/pr-recovery/phase3-e3-runtime-financial-semantics-correction-test-report-2026-08.md):
  // - paid revenue now sourced from the confirmed payment ledger (was paid-invoice total)
  // - expenses now use a positive finalized-state allowlist (UPLOADED/NEEDS_REVIEW excluded)
  // - net result derives from the corrected expense semantics
  // - profit margin is a signed percentage (negative margins served, not hidden)
  // - receivables use the authoritative current outstanding balance (current-only)
  'fin.mtd_paid_revenue': '2.0.0',
  'fin.mtd_expenses': '2.0.0',
  'fin.mtd_net_result': '2.0.0',
  'fin.profit_margin_mtd': '2.0.0',
  'fin.open_receivables': '2.0.0',
  'fin.overdue_receivables': '2.0.0',
  'fin.total_outstanding_receivables': '2.0.0',
  // E4.1C: fleet utilization served with materially different semantics than the
  // never-served 1.0.0 — scheduled occupancy (not actual possession), unknown
  // blocked time, approximate eligibility → coverage-limited PARTIAL metric.
  'ops.fleet_utilization_pct': '2.0.0',
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
