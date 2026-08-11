import type { EvaluationsMetricResponse } from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import { assertValidEvaluationsMetricResponseAgainstDefinition } from '@synq/evaluations-metrics/evaluations-metric-response.validator';
import { requireEvaluationsMetricDefinition } from './evaluations-metric.registry';

/**
 * Authority boundary for registered KPI/analytics responses.
 * E1 does not permit ad-hoc metric ids on this path.
 */
export function assertValidRegisteredEvaluationsMetricResponse(
  response: EvaluationsMetricResponse,
): void {
  const definition = requireEvaluationsMetricDefinition(response.metricId);
  assertValidEvaluationsMetricResponseAgainstDefinition(response, definition);
}
