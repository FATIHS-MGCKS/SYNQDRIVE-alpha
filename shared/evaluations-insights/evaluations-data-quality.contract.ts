/**
 * Unified Auswertungen data quality domain model (Prompt 26/54).
 * Per-source and per-metric assessments — no subjective overall score without dimensions.
 */
import type {
  EvaluationsMetricStatus,
  EvaluationsTimePeriod,
} from './evaluations-analytics-primitives.contract';

export const EVALUATIONS_DATA_QUALITY_VERSION = 'data-quality-v1';

/** Six assessment dimensions — each source/metric must report all applicable dimensions. */
export type EvaluationsDataQualityDimension =
  | 'COMPLETENESS'
  | 'FRESHNESS'
  | 'VALIDITY'
  | 'CONSISTENCY'
  | 'UNIQUENESS'
  | 'COVERAGE';

/** Canonical data quality states for Auswertungen analytics. */
export type EvaluationsDataQualityState =
  | 'GOOD'
  | 'LIMITED'
  | 'STALE'
  | 'INVALID'
  | 'MISSING'
  | 'NOT_CONNECTED'
  | 'NOT_APPLICABLE';

export type EvaluationsDataSourceKey =
  | 'INVOICES'
  | 'BOOKINGS'
  | 'FLEET'
  | 'INSIGHTS'
  | 'COSTS'
  | 'UTILIZATION'
  | 'TELEMETRY'
  | 'SERVICE_CASES'
  | 'DAMAGES';

export interface EvaluationsDataQualityThresholds {
  completeness: {
    goodMinPercent: number;
    limitedMinPercent: number;
    missingBelowPercent: number;
  };
  coverage: {
    goodMinPercent: number;
    limitedMinPercent: number;
  };
  freshness: {
    staleAfterMs: number;
    insightsStaleAfterMs: number;
  };
  uniqueness: {
    overlappingBookingsWarningAt: number;
    overlappingBookingsInvalidAt: number;
  };
}

export interface EvaluationsDataQualityKnownError {
  code: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
}

export interface EvaluationsDataQualityDimensionAssessment {
  dimension: EvaluationsDataQualityDimension;
  state: EvaluationsDataQualityState;
  /** Measured value backing the assessment (percent, count, ISO timestamp, etc.). */
  measuredValue: number | string | null;
  thresholdReference: string;
  notes: string | null;
}

/**
 * Per-source quality assessment.
 * `overallState` is derived from dimension states — not an independent subjective grade.
 */
export interface EvaluationsDataSourceQualityAssessment {
  sourceKey: EvaluationsDataSourceKey;
  label: string;
  period: EvaluationsTimePeriod;
  /** Whether the integration / data pipeline is connected for this tenant scope. */
  integrationConnected: boolean;
  overallState: EvaluationsDataQualityState;
  dimensions: EvaluationsDataQualityDimensionAssessment[];
  expectedRecordCount: number | null;
  presentRecordCount: number | null;
  coveragePercent: number | null;
  lastSuccessfulUpdateAt: string | null;
  knownErrors: EvaluationsDataQualityKnownError[];
  affectedMetrics: string[];
  recommendedRemediation: string[];
}

/** Metric-level data quality binding — flows into cost/utilization metric responses. */
export interface EvaluationsMetricDataQualityBinding {
  metricKey: string;
  metricLabel: string;
  sourceKey: EvaluationsDataSourceKey;
  state: EvaluationsDataQualityState;
  dimensions: EvaluationsDataQualityDimensionAssessment[];
  warnings: string[];
}

/** Optional attachment on individual KPI metrics in cost/utilization models. */
export interface EvaluationsMetricDataQualityAttachment {
  state: EvaluationsDataQualityState;
  sourceKey: EvaluationsDataSourceKey;
  warnings: string[];
}

/**
 * Full domain summary for Auswertungen data quality.
 * Includes legacy fields for backward compatibility with strength/weakness detection.
 */
export interface EvaluationsDataQualityDomainSummary {
  calculationVersion: string;
  period: EvaluationsTimePeriod;
  /** Worst-case state across sources — derived from per-dimension assessments only. */
  rollupStatus: EvaluationsDataQualityState;
  sources: EvaluationsDataSourceQualityAssessment[];
  metricBindings: EvaluationsMetricDataQualityBinding[];
  crossCuttingIssues: EvaluationsDataQualityKnownError[];
  thresholds: EvaluationsDataQualityThresholds;
  /** Legacy section availability — mapped from rollupStatus for existing consumers. */
  overallStatus: EvaluationsMetricStatus;
  insightsStale: boolean;
  insightsLastRunAt: string | null;
  invoiceDataComplete: boolean;
  fleetDataComplete: boolean;
  partialSections: string[];
  unavailableSections: string[];
}

/** Canonical summary type used in analytics responses. */

export interface EvaluationsDataQualityBuildInput {
  period: EvaluationsTimePeriod;
  generatedAt: string;
  sectionStatuses: Array<{ key: string; status: EvaluationsMetricStatus }>;
  loaderHealth: {
    financial: { ok: boolean; error?: string | null };
    bookings: { ok: boolean; error?: string | null };
    fleet: { ok: boolean; error?: string | null };
    insights: { ok: boolean; error?: string | null };
    costModel: { ok: boolean; error?: string | null };
    utilizationModel: { ok: boolean; error?: string | null };
  };
  financial: import('./evaluations-analytics-summary.contract').EvaluationsFinancialSnapshot | null;
  bookings: import('./evaluations-analytics-summary.contract').EvaluationsBookingSnapshot | null;
  fleet: import('./evaluations-analytics-summary.contract').EvaluationsFleetSnapshot | null;
  insights: {
    stale: boolean;
    lastRunAt: string | null;
    hasRun: boolean;
    error: string | null;
  } | null;
  costModelSummary: import('./evaluations-cost-model.contract').EvaluationsCostModelSummary | null;
  costModelSnapshot: import('./evaluations-cost-model.contract').EvaluationsCostModelSnapshot | null;
  utilizationModelSummary: import('./evaluations-utilization-model.contract').EvaluationsUtilizationModelSummary | null;
  utilizationSnapshot: import('./evaluations-utilization-model.contract').EvaluationsUtilizationSnapshot | null;
  overlappingBookingCount: number;
}

export interface EvaluationsDataQualityResponse {
  organizationId: string;
  generatedAt: string;
  period: EvaluationsTimePeriod;
  comparisonPeriod: EvaluationsTimePeriod;
  appliedFilters: import('./evaluations-analytics-filters.contract').EvaluationsAnalyticsAppliedFilters;
  dataQuality: import('./evaluations-analytics-primitives.contract').EvaluationsSectionEnvelope<EvaluationsDataQualityDomainSummary>;
}
