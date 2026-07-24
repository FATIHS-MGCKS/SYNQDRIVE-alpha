import { describe, expect, it } from 'vitest';
import {
  resolveFetchPhase,
  resolveMetricFromEnvelope,
  resolveScalarMetricState,
} from '@synq/evaluations-insights/evaluations-metric-state';

describe('useEvaluationsAnalyticsSummary metric semantics', () => {
  it('failed fetch phase never allows showing a value', () => {
    const state = resolveMetricFromEnvelope({
      envelope: null,
      extractValue: () => 0,
      formatValue: (v) => String(v),
      fetchPhase: 'failed',
      fetchError: 'Timeout',
    });
    expect(state.canShowValue).toBe(false);
    expect(state.displayValue).toBeNull();
  });

  it('receivables ERROR envelope is not shown as zero EUR', () => {
    const state = resolveScalarMetricState({
      value: 0,
      fetchPhase: 'failed',
      fetchError: '500',
      unavailable: true,
    });
    expect(state.kind).toBe('error');
    expect(state.canShowValue).toBe(false);
  });

  it('refetching keeps value with stale overlay', () => {
    const state = resolveMetricFromEnvelope({
      envelope: {
        status: 'OK',
        data: { count: 4 },
        error: null,
        generatedAt: '2026-07-24T10:00:00.000Z',
      },
      extractValue: (d) => d.count,
      formatValue: (v) => String(v),
      fetchPhase: 'refetching',
    });
    expect(state.canShowValue).toBe(true);
    expect(state.showStaleOverlay).toBe(true);
  });
});

describe('resolveFetchPhase hook semantics', () => {
  it('refetching when background refresh', () => {
    expect(
      resolveFetchPhase({ loading: false, isRefetching: true, error: null, hasData: true }),
    ).toBe('refetching');
  });
});
