/**
 * Unified Auswertungen KPI response types and helpers for frontend consumers.
 */
export type {
  EvaluationsMetricComparison,
  EvaluationsMetricComparisonType,
  EvaluationsMetricDataCoverage,
  EvaluationsMetricPeriodRef,
  EvaluationsMetricResponse,
  EvaluationsMetricResponseBundle,
  EvaluationsMetricSourceFreshness,
  EvaluationsMetricStatus,
} from '@synq/evaluations-metrics/evaluations-metric-response.contract';

export {
  EVALUATIONS_METRIC_COMPARISON_TYPES,
  EVALUATIONS_METRIC_RESPONSE_SCHEMA_VERSION,
  EVALUATIONS_METRIC_STATUSES,
} from '@synq/evaluations-metrics/evaluations-metric-response.contract';

export {
  buildAvailableMetric,
  buildComparison,
  buildErrorMetric,
  buildNotApplicableMetric,
  buildPartialMetric,
  buildStaleMetric,
  buildUnavailableMetric,
} from '@synq/evaluations-metrics/evaluations-metric-response.builder';

export {
  assertValidEvaluationsMetricResponse,
  isDisplayableMetricValue,
} from '@synq/evaluations-metrics/evaluations-metric-response.validator';

export {
  LEGACY_BUSINESS_DOCUMENT_STATE_TO_STATUS,
  LEGACY_DISPLAY_TOKEN_TO_STATUS,
  LEGACY_TRUST_FLAG_TO_STATUS,
  resolveLegacyMetricStatus,
} from '@synq/evaluations-metrics/evaluations-metric-response.legacy-map';

import type { EvaluationsMetricResponse } from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import { isDisplayableMetricValue } from '@synq/evaluations-metrics/evaluations-metric-response.validator';
import { formatMoneyMinor } from '@synq/money/money.format';

/** Format money metric for UI — returns null when value must not be shown as zero. */
export function formatMetricCentsDisplay(
  metric: EvaluationsMetricResponse,
  locale = 'de-DE',
): string | null {
  if (!isDisplayableMetricValue(metric)) return null;
  if (typeof metric.value !== 'number') return null;
  return formatMoneyMinor(metric.value, metric.currency ?? 'EUR', locale);
}
