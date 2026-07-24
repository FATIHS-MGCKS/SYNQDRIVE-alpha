/**
 * Unified KPI response contract for Auswertungen metrics.
 * @see docs/architecture/analytics/evaluations-metric-response-contract.md
 */

import type { EvaluationsMetricUnit } from './evaluations-metric.contract';
import type { EvaluationsPeriodPreset } from '@synq/evaluations-periods/evaluations-period.contract';

export const EVALUATIONS_METRIC_RESPONSE_SCHEMA_VERSION = '1.0.0';

export const EVALUATIONS_METRIC_STATUSES = [
  'AVAILABLE',
  'PARTIAL',
  'STALE',
  'UNAVAILABLE',
  'ERROR',
  'NOT_APPLICABLE',
] as const;

export type EvaluationsMetricStatus = (typeof EVALUATIONS_METRIC_STATUSES)[number];

export const EVALUATIONS_METRIC_COMPARISON_TYPES = ['none', 'mom', 'yoy', 'prev_period'] as const;

export type EvaluationsMetricComparisonType = (typeof EVALUATIONS_METRIC_COMPARISON_TYPES)[number];

export interface EvaluationsMetricPeriodRef {
  readonly preset: EvaluationsPeriodPreset | 'snapshot';
  readonly periodStart: string;
  readonly periodEndInclusive: string;
  readonly timezone: string;
}

export interface EvaluationsMetricComparison {
  readonly type: EvaluationsMetricComparisonType;
  readonly priorValue: number | null;
  readonly deltaAbs: number | null;
  readonly deltaPct: number | null;
  readonly status: EvaluationsMetricStatus;
}

export interface EvaluationsMetricDataCoverage {
  /** Observed / expected ratio when known (0–1). */
  readonly ratio: number | null;
  readonly rowsObserved: number | null;
  readonly rowsExpected: number | null;
  readonly missingSources: readonly string[];
}

export interface EvaluationsMetricSourceFreshness {
  readonly latestSourceAt: string | null;
  readonly staleAfterMs: number | null;
  readonly isStale: boolean;
  readonly reason: string | null;
}

/**
 * Canonical KPI payload returned by Auswertungen APIs and consumed by UI/export.
 * `value === 0` is a legitimate measurement; `value === null` means no value (non-AVAILABLE statuses).
 */
export interface EvaluationsMetricResponse {
  readonly metricId: string;
  readonly value: number | string | boolean | null;
  readonly unit: EvaluationsMetricUnit;
  readonly currency: string | null;
  readonly status: EvaluationsMetricStatus;
  readonly generatedAt: string;
  readonly period: EvaluationsMetricPeriodRef;
  readonly comparison: EvaluationsMetricComparison | null;
  readonly dataCoverage: EvaluationsMetricDataCoverage | null;
  readonly sourceFreshness: EvaluationsMetricSourceFreshness | null;
  readonly calculationVersion: string;
  readonly exclusions: readonly string[];
  readonly warnings: readonly string[];
}

export interface EvaluationsMetricResponseBundle {
  readonly schemaVersion: string;
  readonly generatedAt: string;
  readonly metrics: readonly EvaluationsMetricResponse[];
}
