import * as analyticsContract from '@synq/evaluations-analytics/evaluations-analytics.contract';
import {
  EVALUATIONS_METRIC_STATUSES,
  type EvaluationsMetricStatus,
} from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import type {
  EvaluationsAnalyticsStatus,
  EvaluationsAnalyticsSummaryResponse,
} from '@synq/evaluations-analytics/evaluations-analytics.contract';

describe('Evaluations analytics status authority', () => {
  it('does not define a second status constant list', () => {
    expect(
      (analyticsContract as Record<string, unknown>).EVALUATIONS_ANALYTICS_STATUSES,
    ).toBeUndefined();
  });

  it('reuses the E1 status union directly (assignable both ways)', () => {
    const fromE1: EvaluationsMetricStatus = 'PARTIAL';
    const asAnalytics: EvaluationsAnalyticsStatus = fromE1;
    const backToE1: EvaluationsMetricStatus = asAnalytics;
    expect(backToE1).toBe('PARTIAL');
  });

  it('retains STALE from the E1 authority', () => {
    expect(EVALUATIONS_METRIC_STATUSES).toContain('STALE');
    const stale: EvaluationsAnalyticsStatus = 'STALE';
    expect(stale).toBe('STALE');
  });

  it('keeps distinct availability semantics (PARTIAL, ERROR, UNAVAILABLE)', () => {
    const partial: EvaluationsAnalyticsStatus = 'PARTIAL';
    const error: EvaluationsAnalyticsStatus = 'ERROR';
    const unavailable: EvaluationsAnalyticsStatus = 'UNAVAILABLE';
    expect(new Set([partial, error, unavailable]).size).toBe(3);
    // ERROR and UNAVAILABLE are not the same as an empty-but-available result.
    expect(partial).not.toBe('AVAILABLE');
  });

  it('allows a STALE analytics summary response shape', () => {
    const response: Pick<EvaluationsAnalyticsSummaryResponse, 'status' | 'aggregateTotal'> = {
      status: 'STALE',
      aggregateTotal: 5,
    };
    expect(response.status).toBe('STALE');
  });
});
