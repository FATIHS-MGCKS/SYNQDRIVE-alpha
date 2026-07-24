import { describe, expect, it } from 'vitest';
import {
  isDisplayableMetricValue,
} from '@synq/evaluations-metrics/evaluations-metric-response.validator';
import { resolveLegacyMetricStatus } from '@synq/evaluations-metrics/evaluations-metric-response.legacy-map';
import type { EvaluationsMetricResponse } from '@synq/evaluations-metrics/evaluations-metric-response.contract';

describe('evaluations metric response (frontend)', () => {
  it('does not treat ERROR null value as displayable zero', () => {
    const errorMetric: EvaluationsMetricResponse = {
      metricId: 'fin.mtd_issued_revenue',
      value: null,
      unit: 'EUR_CENTS',
      currency: 'EUR',
      status: 'ERROR',
      generatedAt: '2026-06-16T12:00:00.000Z',
      period: {
        preset: 'mtd',
        periodStart: '2026-06-01T00:00:00.000Z',
        periodEndInclusive: '2026-06-16T12:00:00.000Z',
        timezone: 'Europe/Berlin',
      },
      comparison: null,
      dataCoverage: null,
      sourceFreshness: null,
      calculationVersion: '1.0.0',
      exclusions: [],
      warnings: ['load failed'],
    };

    expect(isDisplayableMetricValue(errorMetric)).toBe(false);
    expect(errorMetric.value).not.toBe(0);
  });

  it('AVAILABLE zero is displayable', () => {
    const zeroMetric: EvaluationsMetricResponse = {
      ...{
        metricId: 'fin.mtd_issued_revenue',
        unit: 'EUR_CENTS' as const,
        currency: 'EUR',
        generatedAt: '2026-06-16T12:00:00.000Z',
        period: {
          preset: 'mtd' as const,
          periodStart: '2026-06-01T00:00:00.000Z',
          periodEndInclusive: '2026-06-16T12:00:00.000Z',
          timezone: 'Europe/Berlin',
        },
        comparison: null,
        dataCoverage: null,
        sourceFreshness: null,
        calculationVersion: '1.0.0',
        exclusions: [],
        warnings: [],
      },
      status: 'AVAILABLE',
      value: 0,
    };
    expect(isDisplayableMetricValue(zeroMetric)).toBe(true);
  });

  it('maps legacy em-dash to UNAVAILABLE', () => {
    expect(resolveLegacyMetricStatus({ displayToken: '—' })).toBe('UNAVAILABLE');
  });
});
