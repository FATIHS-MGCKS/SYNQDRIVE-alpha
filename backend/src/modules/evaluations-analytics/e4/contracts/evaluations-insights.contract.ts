/**
 * E4 tenant-safe analytics contracts.
 *
 * These extend the E1/E2 canonical concepts by COMPOSING them — every section
 * carries the E1 6-state status, a stable calculationVersion, the canonical
 * period, the authorized scope, local coverage, generatedAt and a reason when
 * non-available. Money always uses the E1 `EvaluationsMoney` shape (amountMinor
 * + explicit currency). Nothing here forks the metric/status/period/money
 * authorities.
 */
import type { EvaluationsMetricStatus } from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import type { EvaluationsMetricResponse } from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import type { EvaluationsMoney } from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import type { EvaluationsDataCoverage } from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import type { EvaluationsPeriodWindow } from '@synq/evaluations-periods/evaluations-period.contract';

/** Stable E4 calculation versions. Historical *-v1 identifiers are evidence only. */
export const E4_CALCULATION_VERSIONS = {
  summary: 'analytics-summary-e4-v1',
  // v2 (E4.1B): authoritative source set narrowed to explicit-currency invoices;
  // recorded (ServiceCase/Damage) + fixed costs are unsupported (unproven
  // currency/periodicity/effective-date) → section degrades to PARTIAL rather
  // than assigning the current reporting currency or a fake 30-day accrual.
  costModel: 'cost-model-e4-v2',
  // v2 (E4.1C): scheduled-occupancy semantics (booking start/end, not actual
  // possession), blocked history unsupported (blockedMs unknown, never 0),
  // approximate eligibility → the section is coverage-limited (PARTIAL), never
  // a false-zero on UNAVAILABLE/ERROR.
  utilization: 'utilization-model-e4-v2',
  // v3 (E4.2): a rule is evaluated only when its source dimension is AVAILABLE;
  // a PARTIAL/UNAVAILABLE source dimension is skipped (recorded) and downgrades
  // the section to PARTIAL — a PARTIAL input can no longer become fully AVAILABLE
  // detection evidence. (v2 = E4.1C platform-rule threshold labeling.)
  strengthDetection: 'strength-detection-e4-v3',
  weaknessDetection: 'weakness-detection-e4-v3',
  driverInfluence: 'driver-influence-e4-v1',
} as const;

/** Authorized scope echoed back on every section for auditability. */
export interface EvaluationsInsightsScope {
  readonly organizationId: string;
  readonly stationIds: readonly string[] | null;
  readonly stationScoped: boolean;
}

/** Common per-section audit metadata (STEP 48). */
export interface EvaluationsInsightsSectionMeta {
  readonly status: EvaluationsMetricStatus;
  readonly calculationVersion: string;
  readonly period: EvaluationsPeriodWindow;
  readonly scope: EvaluationsInsightsScope;
  readonly coverage: EvaluationsDataCoverage | null;
  readonly generatedAt: string;
  /** Machine-readable reason when the section is not fully AVAILABLE. */
  readonly reason: string | null;
}

// ── Cost Model ──────────────────────────────────────────────────────────────

export const E4_COST_CATEGORIES = [
  'OPERATING_EXPENSES',
  'UNPLANNED_MAINTENANCE',
  'DAMAGE_REPAIR',
  'ESTIMATED_FIXED_COSTS',
] as const;
export type E4CostCategory = (typeof E4_COST_CATEGORIES)[number];

export type E4CostNature = 'ACTUAL' | 'ESTIMATED';

export interface E4CostCategoryResult {
  readonly category: E4CostCategory;
  readonly nature: E4CostNature;
  readonly status: EvaluationsMetricStatus;
  /** Per-currency totals — never blended into one false total. */
  readonly totalsByCurrency: readonly EvaluationsMoney[];
  readonly eventCount: number;
  readonly formula: string;
  readonly sources: readonly string[];
  readonly reason: string | null;
}

export interface EvaluationsCostModelSection extends EvaluationsInsightsSectionMeta {
  readonly categories: readonly E4CostCategoryResult[];
  /** Grand totals per currency across ACTUAL + ESTIMATED categories. */
  readonly totalsByCurrency: readonly EvaluationsMoney[];
  readonly reportingCurrency: string | null;
  readonly mixedCurrency: boolean;
}

// ── Utilization ─────────────────────────────────────────────────────────────

/**
 * Utilization occupancy basis. On current main only SCHEDULED occupancy (booking
 * start/end) can be reconstructed; ACTUAL possession would require authoritative
 * handover/return timestamps and is not claimed.
 */
export type E4OccupancyBasis = 'SCHEDULED' | 'ACTUAL';

/**
 * All numeric quantities are `number | null`: a `null` means the quantity was NOT
 * observed/calculated (UNAVAILABLE/ERROR, or — for `blockedMs` — no authoritative
 * historical blocked source exists). A numeric `0` is only ever a real observed
 * measurement, never a stand-in for "unknown".
 */
export interface EvaluationsUtilizationSection extends EvaluationsInsightsSectionMeta {
  readonly utilizationPercent: EvaluationsMetricResponse;
  readonly occupancyBasis: E4OccupancyBasis;
  readonly capacityMs: number | null;
  readonly rentedMs: number | null;
  readonly maintenanceMs: number | null;
  /** Always null on current main: no authoritative historical blocked source. */
  readonly blockedMs: number | null;
  readonly netCapacityMs: number | null;
  readonly eligibleVehicles: number | null;
  readonly overlappingBookingPairs: number | null;
  /**
   * A CURRENT telemetry snapshot count (as of `telemetrySnapshotAsOf`), surfaced
   * only for a live/current period. For a historical period it is `null` — the
   * current `latestState.online` is never presented as a historical period fact.
   * It never participates in utilization/downtime math (telemetry offline is not
   * downtime).
   */
  readonly telemetryOfflineVehicles: number | null;
  readonly telemetrySnapshotAsOf: string | null;
}

// ── Strength / Weakness ─────────────────────────────────────────────────────

export type E4ComparatorBasis =
  | 'PREVIOUS_COMPARABLE_PERIOD'
  // A deterministic platform-defined rule constant (NOT a tenant-configured
  // target). Used for fixed thresholds like 70% high utilization.
  | 'PLATFORM_RULE_THRESHOLD'
  // Only when a real tenant-specific target configuration exists (none does on
  // current main) — never used for platform constants.
  | 'ORGANIZATION_TARGET'
  | 'PEER_STATION_COHORT';

export type E4EvidenceKind = 'OBSERVATION' | 'ESTIMATE';

export type E4Severity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface E4DetectionEvidence {
  readonly metricId: string | null;
  readonly observedValue: number;
  readonly comparisonValue: number | null;
  readonly threshold: number;
  readonly unit: string;
  readonly sampleSize: number;
}

export interface E4StrengthResult {
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly comparatorBasis: E4ComparatorBasis;
  readonly evidenceKind: E4EvidenceKind;
  readonly evidence: E4DetectionEvidence;
  readonly dimension: string;
}

export interface E4WeaknessResult {
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly severity: E4Severity;
  readonly comparatorBasis: E4ComparatorBasis;
  readonly evidenceKind: E4EvidenceKind;
  readonly evidence: E4DetectionEvidence;
  readonly dimension: string;
}

/**
 * A configured analytical dimension that could not be evaluated (its source was
 * not sufficiently authoritative), with a machine-readable reason. Skipped
 * dimensions downgrade the detection section to PARTIAL so an empty result never
 * implies "everything was checked".
 */
export interface E4SkippedDimension {
  readonly dimension: string;
  readonly reason: string;
}

export interface EvaluationsStrengthSection extends EvaluationsInsightsSectionMeta {
  readonly strengths: readonly E4StrengthResult[];
  readonly evaluatedDimensions: readonly string[];
  readonly skippedDimensions: readonly E4SkippedDimension[];
}

export interface EvaluationsWeaknessSection extends EvaluationsInsightsSectionMeta {
  readonly weaknesses: readonly E4WeaknessResult[];
  readonly evaluatedDimensions: readonly string[];
  readonly skippedDimensions: readonly E4SkippedDimension[];
}

// ── Driver / Influence ──────────────────────────────────────────────────────

export const E4_DRIVER_ANALYSIS_DISCLAIMER =
  'Driver influence factors indicate statistical association only. Correlation is not causation; no causal claim is made about any individual driver.';

export interface E4DriverFactor {
  /** Organization-scoped Customer id acting as the driver reference. */
  readonly driverRef: string;
  readonly associatedDimension: string;
  /** Share of the observed pattern associated with this driver, in [0,1]. */
  readonly associationShare: number;
  readonly sampleSize: number;
  /** Deliberately association-only language (never causal). */
  readonly relationship: 'ASSOCIATED_WITH' | 'CORRELATES_WITH';
}

export interface EvaluationsDriverInfluenceSection extends EvaluationsInsightsSectionMeta {
  readonly disclaimer: string;
  readonly confounders: readonly string[];
  readonly factors: readonly E4DriverFactor[];
  /**
   * E5B server-resolved PII tier applied to this person-level section:
   *  - `full`: raw org-scoped driver references,
   *  - `pseudonymous`: driver references are non-reversible pseudonyms,
   *  - `none`: person-level access denied (section UNAVAILABLE, no factors).
   */
  readonly piiTier: 'full' | 'pseudonymous' | 'none';
}

// ── Analytics Summary composition ───────────────────────────────────────────

export interface EvaluationsAnalyticsInsightsSummary {
  readonly schemaVersion: '1.0.0';
  readonly generatedAt: string;
  readonly scope: EvaluationsInsightsScope;
  readonly period: EvaluationsPeriodWindow;
  readonly calculationVersion: string;
  readonly sections: {
    /** Finance is delegated verbatim to the E3 canonical service. */
    readonly finance: {
      readonly status: EvaluationsMetricStatus;
      readonly metrics: Readonly<Record<string, EvaluationsMetricResponse>>;
      readonly reason: string | null;
    };
    readonly costModel: EvaluationsCostModelSection;
    readonly utilization: EvaluationsUtilizationSection;
    readonly strengths: EvaluationsStrengthSection;
    readonly weaknesses: EvaluationsWeaknessSection;
    readonly driverInfluence: EvaluationsDriverInfluenceSection;
  };
}
