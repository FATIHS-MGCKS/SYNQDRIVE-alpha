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
  utilization: 'utilization-model-e4-v1',
  strengthDetection: 'strength-detection-e4-v1',
  weaknessDetection: 'weakness-detection-e4-v1',
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

export interface EvaluationsUtilizationSection extends EvaluationsInsightsSectionMeta {
  readonly utilizationPercent: EvaluationsMetricResponse;
  readonly capacityMs: number;
  readonly rentedMs: number;
  readonly maintenanceMs: number;
  readonly blockedMs: number;
  readonly netCapacityMs: number;
  readonly eligibleVehicles: number;
  readonly overlappingBookingPairs: number;
  readonly telemetryOfflineVehicles: number;
}

// ── Strength / Weakness ─────────────────────────────────────────────────────

export type E4ComparatorBasis =
  | 'PREVIOUS_COMPARABLE_PERIOD'
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

export interface EvaluationsStrengthSection extends EvaluationsInsightsSectionMeta {
  readonly strengths: readonly E4StrengthResult[];
}

export interface EvaluationsWeaknessSection extends EvaluationsInsightsSectionMeta {
  readonly weaknesses: readonly E4WeaknessResult[];
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
