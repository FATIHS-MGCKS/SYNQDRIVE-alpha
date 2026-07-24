/**
 * Auswertungen data lineage and freshness metadata (Prompt 27/54).
 * User-facing provenance — no credentials or internal infrastructure secrets.
 */
import type { EvaluationsTimePeriod } from './evaluations-analytics-primitives.contract';
import type { EvaluationsDataSourceKey } from './evaluations-data-quality.contract';
import type { EvaluationsSectionEnvelope } from './evaluations-analytics-primitives.contract';

export const EVALUATIONS_LINEAGE_VERSION = 'lineage-v1';

export type EvaluationsLineageAudience = 'STANDARD' | 'ADMIN';

export type EvaluationsLineageFreshnessState = 'FRESH' | 'DELAYED' | 'STALE' | 'UNKNOWN' | 'FAILED';

export type EvaluationsLineageRecalculationTrigger = 'SCHEDULED' | 'ON_DEMAND' | 'CACHE';

export interface EvaluationsLineageExclusion {
  reasonCode: string;
  reason: string;
  excludedCount: number;
}

export interface EvaluationsLineageCoverage {
  percent: number | null;
  includedCount: number | null;
  eligibleCount: number | null;
}

export interface EvaluationsLineageFreshness {
  state: EvaluationsLineageFreshnessState;
  /** Documented stale threshold for this source — ms. */
  staleThresholdMs: number | null;
  /** Human-readable threshold reference (no infra secrets). */
  staleThresholdLabel: string | null;
}

export interface EvaluationsLineageSourceError {
  code: string;
  message: string;
  affectsMetrics: string[];
}

/** Per-metric or per-analysis lineage block. */
export interface EvaluationsMetricLineage {
  metricKey: string;
  metricLabel: string;
  dataSources: string[];
  oldestIncludedRecordAt: string | null;
  newestIncludedRecordAt: string | null;
  lastSuccessfulImportAt: string | null;
  lastSuccessfulBackgroundJobAt: string | null;
  calculatedAt: string;
  calculationVersion: string;
  excludedRecordCount: number;
  exclusionReasons: EvaluationsLineageExclusion[];
  dataCoverage: EvaluationsLineageCoverage;
  freshness: EvaluationsLineageFreshness;
  sourceErrors: EvaluationsLineageSourceError[];
  /** Admin-only diagnostics — stripped for STANDARD audience. */
  adminDiagnostics?: EvaluationsLineageAdminDiagnostics;
}

export interface EvaluationsLineageAdminDiagnostics {
  loaderKey: string | null;
  backgroundJobName: string | null;
  recalculationTrigger: EvaluationsLineageRecalculationTrigger;
  servedFromCache: boolean;
  cacheGeneratedAt: string | null;
  sourceKey: EvaluationsDataSourceKey | null;
  notes: string[];
}

/** Section-level lineage aggregate (attached to section envelopes). */
export interface EvaluationsSectionLineage {
  sectionKey: string;
  calculatedAt: string;
  calculationVersion: string;
  metrics: EvaluationsMetricLineage[];
  freshness: EvaluationsLineageFreshness;
}

export interface EvaluationsLineageSummary {
  calculationVersion: string;
  calculatedAt: string;
  period: EvaluationsTimePeriod;
  audience: EvaluationsLineageAudience;
  metrics: EvaluationsMetricLineage[];
  sections: EvaluationsSectionLineage[];
  sourceErrors: EvaluationsLineageSourceError[];
  /** Sources not yet covered by lineage v1 — documented explicitly. */
  sourcesWithoutLineage: string[];
  freshnessPolicyReference: string;
}

export interface EvaluationsLineageBuildInput {
  period: EvaluationsTimePeriod;
  generatedAt: string;
  audience: EvaluationsLineageAudience;
  recalculationTrigger?: EvaluationsLineageRecalculationTrigger;
  servedFromCache?: boolean;
  cacheGeneratedAt?: string | null;
  dataQuality: import('./evaluations-data-quality.contract').EvaluationsDataQualityDomainSummary;
  loaderHealth: import('./evaluations-data-quality.contract').EvaluationsDataQualityBuildInput['loaderHealth'];
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
  sectionStatuses: Array<{ key: string; status: import('./evaluations-analytics-primitives.contract').EvaluationsMetricStatus }>;
}

/** @see EvaluationsLineageResponse in evaluations-analytics-summary.contract */
export function resolveLineageAudience(
  membershipRole: string | null | undefined,
  platformRole?: string | null,
): EvaluationsLineageAudience {
  if (platformRole === 'MASTER_ADMIN') return 'ADMIN';
  if (membershipRole === 'ORG_ADMIN') return 'ADMIN';
  return 'STANDARD';
}
