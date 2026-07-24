/**
 * Unit tests for Auswertungen metric state UX (Prompt 28/54).
 */
import {
  buildSummaryExportRows,
  formatCount,
  resolveFetchPhase,
  resolveMetricFromEnvelope,
  resolveScalarMetricState,
  summaryExportToCsv,
} from './evaluations-metric-state';
import type { EvaluationsAnalyticsSummaryResponse } from './evaluations-analytics-summary.contract';

const envelopeOk = <T>(data: T) => ({
  status: 'OK' as const,
  data,
  error: null,
  generatedAt: '2026-07-24T10:00:00.000Z',
});

const envelopeError = () => ({
  status: 'ERROR' as const,
  data: null,
  error: 'Invoice query failed',
  generatedAt: '2026-07-24T10:00:00.000Z',
});

describe('resolveFetchPhase', () => {
  it('loading without data', () => {
    expect(resolveFetchPhase({ loading: true, isRefetching: false, error: null, hasData: false })).toBe('loading');
  });
  it('refetching with data', () => {
    expect(resolveFetchPhase({ loading: false, isRefetching: true, error: null, hasData: true })).toBe('refetching');
  });
  it('failed without data', () => {
    expect(resolveFetchPhase({ loading: false, isRefetching: false, error: '500', hasData: false })).toBe('failed');
  });
});

describe('resolveMetricFromEnvelope', () => {
  const fmt = (v: number) => String(v);

  it('never shows value on API 500 error envelope', () => {
    const state = resolveMetricFromEnvelope({
      envelope: envelopeError(),
      extractValue: () => 0,
      formatValue: fmt,
      fetchPhase: 'ready',
    });
    expect(state.kind).toBe('error');
    expect(state.canShowValue).toBe(false);
    expect(state.displayValue).toBeNull();
  });

  it('shows true zero when section OK', () => {
    const state = resolveMetricFromEnvelope({
      envelope: envelopeOk({ count: 0 }),
      extractValue: (d) => d.count,
      formatValue: fmt,
      fetchPhase: 'ready',
      zeroMeansNull: true,
    });
    expect(state.kind).toBe('null_value');
    expect(state.canShowValue).toBe(true);
    expect(state.rawValue).toBe(0);
  });

  it('marks stale when freshness.stale', () => {
    const state = resolveMetricFromEnvelope({
      envelope: {
        ...envelopeOk({ count: 3 }),
        freshness: { stale: true, lastUpdatedAt: '2026-07-20T00:00:00.000Z' },
      },
      extractValue: (d) => d.count,
      formatValue: fmt,
      fetchPhase: 'ready',
    });
    expect(state.kind).toBe('stale');
    expect(state.canShowValue).toBe(true);
  });

  it('partial section without data is not shown as zero', () => {
    const state = resolveMetricFromEnvelope({
      envelope: {
        status: 'PARTIAL',
        data: null,
        error: 'Fleet snapshot incomplete',
        generatedAt: '2026-07-24T10:00:00.000Z',
      },
      extractValue: () => 0,
      formatValue: fmt,
      fetchPhase: 'ready',
    });
    expect(state.kind).toBe('partial');
    expect(state.canShowValue).toBe(false);
  });

  it('loading phase hides value', () => {
    const state = resolveMetricFromEnvelope({
      envelope: envelopeOk({ count: 5 }),
      extractValue: (d) => d.count,
      formatValue: fmt,
      fetchPhase: 'loading',
    });
    expect(state.canShowValue).toBe(false);
  });

  it('refetching keeps value with stale overlay flag', () => {
    const state = resolveMetricFromEnvelope({
      envelope: envelopeOk({ count: 5 }),
      extractValue: (d) => d.count,
      formatValue: fmt,
      fetchPhase: 'refetching',
    });
    expect(state.canShowValue).toBe(true);
    expect(state.showStaleOverlay).toBe(true);
    expect(state.tooltip).toContain('Aktualisierung');
  });

  it('not applicable', () => {
    const state = resolveMetricFromEnvelope({
      envelope: envelopeOk({ count: 1 }),
      extractValue: (d) => d.count,
      formatValue: fmt,
      fetchPhase: 'ready',
      notApplicable: true,
    });
    expect(state.kind).toBe('not_applicable');
    expect(state.canShowValue).toBe(false);
  });
});

describe('resolveScalarMetricState', () => {
  it('invoice error does not format as 0 EUR', () => {
    const state = resolveScalarMetricState({
      value: 0,
      fetchPhase: 'failed',
      fetchError: 'Timeout',
    });
    expect(state.canShowValue).toBe(false);
    expect(state.kind).toBe('error');
  });
});

describe('summary export', () => {
  const minimalSummary = {
    receivables: envelopeError(),
    activeRisks: envelopeOk({
      businessRiskGroups: 0,
      revenueLeakageGroups: 0,
      complianceInsightGroups: 0,
      criticalInsights: 0,
      criticalBookings: 0,
      estimatedExposureMinor: 0,
      exposureCurrency: 'EUR',
      orgWideRisks: 0,
      bookingScopedRisks: 0,
    }),
    downtime: {
      status: 'UNAVAILABLE' as const,
      data: null,
      error: 'Fleet unavailable',
      generatedAt: '2026-07-24T10:00:00.000Z',
    },
  } as unknown as EvaluationsAnalyticsSummaryResponse;

  it('export marks excluded receivables on error', () => {
    const rows = buildSummaryExportRows(minimalSummary);
    const open = rows.find((r) => r.metricKey === 'openAmount');
    expect(open?.excluded).toBe(true);
    expect(open?.status).toBe('ERROR');
    expect(open?.value).toBe('—');
  });

  it('csv includes status columns', () => {
    const csv = summaryExportToCsv(buildSummaryExportRows(minimalSummary));
    expect(csv.split('\n')[0]).toContain('ux_kind');
    expect(csv).toContain('ERROR');
    expect(csv).toContain('excluded');
  });
});

describe('formatCount', () => {
  it('formats de locale', () => {
    expect(formatCount(1200, 'de')).toContain('1');
  });
});
