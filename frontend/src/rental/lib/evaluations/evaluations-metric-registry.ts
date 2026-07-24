/**
 * Client-side registry lookup for calculation versions (provenance builders).
 * Full metric definitions are served by GET /api/v1/evaluations-metrics/registry.
 */
import type { EvaluationsMetricDefinition } from '@synq/evaluations-metrics/evaluations-metric.contract';
import { resolveEvaluationsMetricCalculationVersion } from '@synq/evaluations-metrics/evaluations-metric-calculation-versions';

export function requireEvaluationsMetricDefinition(
  metricId: string,
): Pick<EvaluationsMetricDefinition, 'id' | 'calculationVersion'> {
  return {
    id: metricId,
    calculationVersion: resolveEvaluationsMetricCalculationVersion(metricId),
  };
}
