import type {
  EvaluationsMetricResponse,
  EvaluationsMetricStatus,
} from './evaluations-metric-response.contract';
import { EVALUATIONS_METRIC_STATUSES } from './evaluations-metric-response.contract';

export class EvaluationsMetricResponseValidationError extends Error {
  readonly metricId?: string;

  constructor(message: string, metricId?: string) {
    super(message);
    this.name = 'EvaluationsMetricResponseValidationError';
    this.metricId = metricId;
  }
}

const NULL_VALUE_STATUSES: ReadonlySet<EvaluationsMetricStatus> = new Set([
  'UNAVAILABLE',
  'ERROR',
  'NOT_APPLICABLE',
]);

export function assertValidEvaluationsMetricResponse(
  response: EvaluationsMetricResponse,
): void {
  if (!response.metricId?.trim()) {
    throw new EvaluationsMetricResponseValidationError('metricId is required');
  }

  if (!EVALUATIONS_METRIC_STATUSES.includes(response.status)) {
    throw new EvaluationsMetricResponseValidationError(
      `Invalid status: ${response.status}`,
      response.metricId,
    );
  }

  if (NULL_VALUE_STATUSES.has(response.status)) {
    if (response.value !== null) {
      throw new EvaluationsMetricResponseValidationError(
        `${response.status} must not carry a numeric placeholder value (got ${JSON.stringify(response.value)})`,
        response.metricId,
      );
    }
  }

  if (response.status === 'AVAILABLE' && response.value === null) {
    throw new EvaluationsMetricResponseValidationError(
      'AVAILABLE requires a non-null value (use 0 for zero)',
      response.metricId,
    );
  }

  if (response.status === 'PARTIAL') {
    const coverage = response.dataCoverage;
    const hasCoverage =
      coverage != null &&
      ((coverage.missingSources?.length ?? 0) > 0 ||
        (coverage.ratio != null && coverage.ratio < 1));
    if (!hasCoverage) {
      throw new EvaluationsMetricResponseValidationError(
        'PARTIAL requires dataCoverage with missingSources or ratio < 1',
        response.metricId,
      );
    }
  }

  if (response.status === 'STALE') {
    const freshness = response.sourceFreshness;
    if (!freshness?.isStale || !freshness.reason?.trim()) {
      throw new EvaluationsMetricResponseValidationError(
        'STALE requires sourceFreshness.isStale=true and reason',
        response.metricId,
      );
    }
  }
}

export function isDisplayableMetricValue(
  response: Pick<EvaluationsMetricResponse, 'status' | 'value'>,
): boolean {
  return response.status === 'AVAILABLE' || response.status === 'PARTIAL' || response.status === 'STALE';
}
