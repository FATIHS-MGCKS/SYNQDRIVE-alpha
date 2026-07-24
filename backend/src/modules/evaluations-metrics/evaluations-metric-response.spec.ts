import {
  buildAvailableMetric,
  buildErrorMetric,
  buildNotApplicableMetric,
  buildPartialMetric,
  buildStaleMetric,
  buildUnavailableMetric,
} from '@synq/evaluations-metrics/evaluations-metric-response.builder';
import {
  assertValidEvaluationsMetricResponse,
  EvaluationsMetricResponseValidationError,
  isDisplayableMetricValue,
} from '@synq/evaluations-metrics/evaluations-metric-response.validator';
import { resolveLegacyMetricStatus } from '@synq/evaluations-metrics/evaluations-metric-response.legacy-map';

const period = {
  preset: 'mtd' as const,
  periodStart: '2026-06-01T00:00:00.000Z',
  periodEndInclusive: '2026-06-16T12:00:00.000Z',
  timezone: 'Europe/Berlin',
};

const base = {
  metricId: 'fin.mtd_issued_revenue',
  unit: 'EUR_CENTS' as const,
  currency: 'EUR',
  generatedAt: new Date('2026-06-16T12:00:00.000Z'),
  period,
  calculationVersion: '1.0.0',
  exclusions: ['revenue_excluded_statuses:DRAFT'],
};

describe('evaluations metric response contract', () => {
  it('AVAILABLE allows zero as a real value', () => {
    const m = buildAvailableMetric({ ...base, value: 0 });
    expect(m.status).toBe('AVAILABLE');
    expect(m.value).toBe(0);
    expect(isDisplayableMetricValue(m)).toBe(true);
  });

  it('ERROR rejects non-null value including zero placeholder', () => {
    expect(() =>
      buildErrorMetric({ ...base, error: 'load failed' }),
    ).not.toThrow();
    const m = buildErrorMetric({ ...base, error: 'load failed' });
    expect(m.value).toBeNull();
    expect(m.status).toBe('ERROR');
    expect(() =>
      assertValidEvaluationsMetricResponse({ ...m, value: 0 }),
    ).toThrow(EvaluationsMetricResponseValidationError);
  });

  it('UNAVAILABLE rejects zero placeholder', () => {
    const m = buildUnavailableMetric({ ...base, reason: 'no data' });
    expect(m.value).toBeNull();
    expect(() =>
      assertValidEvaluationsMetricResponse({ ...m, value: 0 }),
    ).toThrow(/must not carry/);
  });

  it('NOT_APPLICABLE is distinct from UNAVAILABLE and has null value', () => {
    const na = buildNotApplicableMetric({ ...base, metricId: 'ins.battery_critical_gated', reason: 'No HV fleet' });
    const un = buildUnavailableMetric({ ...base, reason: 'Source missing' });
    expect(na.status).toBe('NOT_APPLICABLE');
    expect(un.status).toBe('UNAVAILABLE');
    expect(na.value).toBeNull();
    expect(() => assertValidEvaluationsMetricResponse({ ...na, value: 0 })).toThrow();
  });

  it('PARTIAL requires dataCoverage with missing sources or ratio < 1', () => {
    const m = buildPartialMetric({
      ...base,
      value: 12_500,
      dataCoverage: {
        ratio: 0.8,
        rowsObserved: 80,
        rowsExpected: 100,
        missingSources: ['customer_labels'],
      },
    });
    expect(m.status).toBe('PARTIAL');
    expect(() =>
      assertValidEvaluationsMetricResponse({
        ...m,
        dataCoverage: { ratio: 1, rowsObserved: 10, rowsExpected: 10, missingSources: [] },
      }),
    ).toThrow(/PARTIAL requires dataCoverage/);
  });

  it('STALE requires sourceFreshness timestamp and reason', () => {
    const m = buildStaleMetric({
      ...base,
      value: 42_000,
      sourceFreshness: {
        latestSourceAt: '2026-06-14T08:00:00.000Z',
        staleAfterMs: 86_400_000,
        isStale: true,
        reason: 'Invoice sync older than 24h',
      },
    });
    expect(m.status).toBe('STALE');
    expect(() =>
      assertValidEvaluationsMetricResponse({
        ...m,
        sourceFreshness: {
          latestSourceAt: '2026-06-14T08:00:00.000Z',
          staleAfterMs: 86_400_000,
          isStale: false,
          reason: null,
        },
      }),
    ).toThrow(/STALE requires/);
  });

  it('legacy display tokens map to canonical status', () => {
    expect(resolveLegacyMetricStatus({ displayToken: '—' })).toBe('UNAVAILABLE');
    expect(resolveLegacyMetricStatus({ displayToken: 'N/A' })).toBe('NOT_APPLICABLE');
    expect(resolveLegacyMetricStatus({ isStale: true })).toBe('STALE');
    expect(resolveLegacyMetricStatus({ hasError: true })).toBe('ERROR');
  });
});
