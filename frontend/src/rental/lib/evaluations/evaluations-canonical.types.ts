/**
 * E6A canonical frontend transport types.
 *
 * These MIRROR the backend E4/E5 wire contracts EXACTLY. E1 primitives
 * (status/period/money/coverage/freshness) are imported from the shared canonical
 * mirror (`@synq/evaluations-*`), never re-declared. E4 (`e4/contracts/
 * evaluations-insights.contract.ts`) and E5 (`e5/contracts/evaluations-quality.contract.ts`)
 * have no shared mirror, so their shapes are mirrored here verbatim with documented
 * provenance. FRONTEND_CONTRACT_DIVERGENCE_COUNT = 0: no field is renamed, dropped,
 * widened, or reinterpreted.
 *
 * Nothing here recomputes business truth. These are transport types only.
 */
import type {
  EvaluationsMetricStatus,
  EvaluationsMetricResponse,
  EvaluationsMoney,
  EvaluationsDataCoverage,
  EvaluationsSourceFreshness,
} from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import type { EvaluationsPeriodWindow } from '@synq/evaluations-periods/evaluations-period.contract';

// Re-export the E1 primitives so E6 components import a single canonical surface.
export type {
  EvaluationsMetricStatus,
  EvaluationsMetricResponse,
  EvaluationsMoney,
  EvaluationsDataCoverage,
  EvaluationsSourceFreshness,
  EvaluationsPeriodWindow,
};

// ── E4 insights (mirror: backend/src/modules/evaluations-analytics/e4/contracts/evaluations-insights.contract.ts) ──

export interface EvaluationsInsightsScope {
  readonly organizationId: string;
  readonly stationIds: readonly string[] | null;
  readonly stationScoped: boolean;
}

export interface EvaluationsInsightsSectionMeta {
  readonly status: EvaluationsMetricStatus;
  readonly calculationVersion: string;
  readonly period: EvaluationsPeriodWindow;
  readonly scope: EvaluationsInsightsScope;
  readonly coverage: EvaluationsDataCoverage | null;
  readonly generatedAt: string;
  readonly reason: string | null;
}

export type E4CostCategory =
  | 'OPERATING_EXPENSES'
  | 'UNPLANNED_MAINTENANCE'
  | 'DAMAGE_REPAIR'
  | 'ESTIMATED_FIXED_COSTS';

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
  readonly totalsByCurrency: readonly EvaluationsMoney[];
  readonly reportingCurrency: string | null;
  readonly mixedCurrency: boolean;
}

export type E4OccupancyBasis = 'SCHEDULED' | 'ACTUAL';

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
  readonly telemetryOfflineVehicles: number | null;
  readonly telemetrySnapshotAsOf: string | null;
}

export type E4ComparatorBasis =
  | 'PREVIOUS_COMPARABLE_PERIOD'
  | 'PLATFORM_RULE_THRESHOLD'
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

/** Server-resolved E5B PII tier. The frontend ONLY renders this; it never derives it. */
export type EvaluationsPiiTier = 'full' | 'pseudonymous' | 'none';

export interface E4DriverFactor {
  /** Organization-scoped, server-permitted driver reference (raw or pseudonym). */
  readonly driverRef: string;
  readonly associatedDimension: string;
  readonly associationShare: number;
  readonly sampleSize: number;
  readonly relationship: 'ASSOCIATED_WITH' | 'CORRELATES_WITH';
}

export interface EvaluationsDriverInfluenceSection extends EvaluationsInsightsSectionMeta {
  readonly disclaimer: string;
  readonly confounders: readonly string[];
  readonly factors: readonly E4DriverFactor[];
  readonly piiTier: EvaluationsPiiTier;
}

export interface EvaluationsFinanceSectionSlice {
  readonly status: EvaluationsMetricStatus;
  readonly metrics: Readonly<Record<string, EvaluationsMetricResponse>>;
  readonly reason: string | null;
}

export interface EvaluationsAnalyticsInsightsSummary {
  readonly schemaVersion: '1.0.0';
  readonly generatedAt: string;
  readonly scope: EvaluationsInsightsScope;
  readonly period: EvaluationsPeriodWindow;
  readonly calculationVersion: string;
  readonly sections: {
    readonly finance: EvaluationsFinanceSectionSlice;
    readonly costModel: EvaluationsCostModelSection;
    readonly utilization: EvaluationsUtilizationSection;
    readonly strengths: EvaluationsStrengthSection;
    readonly weaknesses: EvaluationsWeaknessSection;
    readonly driverInfluence: EvaluationsDriverInfluenceSection;
  };
}

// ── E5 quality (mirror: backend/src/modules/evaluations-analytics/e5/contracts/evaluations-quality.contract.ts) ──

export type E5QualityDimension =
  | 'FRESHNESS'
  | 'COMPLETENESS'
  | 'PROVENANCE'
  | 'VALIDITY'
  | 'TEMPORAL_APPLICABILITY';

export type E5DimensionState = 'COMPLETE' | 'PARTIAL' | 'UNKNOWN' | 'UNAVAILABLE';

export interface E5QualityScope {
  readonly organizationId: string;
  readonly stationIds: readonly string[] | null;
  readonly stationScoped: boolean;
}

export interface E5LineageRef {
  readonly sourceCategory: string;
  readonly sourceRef: string;
  readonly effectiveTimestamp: string | null;
  readonly calculationVersion: string;
  readonly reason: string;
}

export interface E5BusinessEventRecency {
  readonly newestAt: string | null;
  readonly oldestAt: string | null;
}

export interface E5SectionQuality {
  readonly section: string;
  readonly status: EvaluationsMetricStatus;
  readonly dimensions: Readonly<Record<E5QualityDimension, E5DimensionState>>;
  readonly freshness: EvaluationsSourceFreshness | null;
  readonly businessEventRecency: E5BusinessEventRecency | null;
  readonly coverage: EvaluationsDataCoverage | null;
  readonly requiredSourceClasses: readonly string[];
  readonly lineage: readonly E5LineageRef[];
  readonly reason: string | null;
}

export interface EvaluationsQualityReport {
  readonly schemaVersion: '1.0.0';
  readonly generatedAt: string;
  readonly scope: E5QualityScope;
  readonly period: EvaluationsPeriodWindow;
  readonly calculationVersion: string;
  readonly sections: readonly E5SectionQuality[];
  readonly overall: {
    readonly status: EvaluationsMetricStatus;
    readonly complete: boolean;
    readonly reason: string | null;
  };
}
