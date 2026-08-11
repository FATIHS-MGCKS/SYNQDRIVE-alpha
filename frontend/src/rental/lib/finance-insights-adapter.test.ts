import { describe, expect, it } from 'vitest';
import type { EvaluationsMetricResponse } from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import type { FinancialInsightsBundleDto } from './finance-insights.types';
import { FINANCE_CORE_METRIC_IDS } from './finance-insights.types';
import {
  formatFinanceMoney,
  formatFinancePercent,
  isMoneyAvailable,
  readMoneyMetric,
  readPercentMetric,
} from './finance-insights-adapter';

function money(
  metricId: string,
  status: EvaluationsMetricResponse['status'],
  value: { amountMinor: number; currency: string } | null,
  warnings: string[] = [],
): EvaluationsMetricResponse {
  return {
    schemaVersion: '1.0.0',
    metricId,
    metricKind: 'OBSERVED',
    valueType: 'MONEY',
    unit: 'CURRENCY_MINOR',
    status,
    value,
    generatedAt: '2026-08-11T00:00:00.000Z',
    period: {} as never,
    comparison: null,
    dataCoverage: null,
    sourceFreshness: null,
    calculationVersion: '2.0.0',
    exclusions: [],
    warnings,
  } as EvaluationsMetricResponse;
}

function percent(
  metricId: string,
  status: EvaluationsMetricResponse['status'],
  value: number | null,
  warnings: string[] = [],
): EvaluationsMetricResponse {
  return {
    schemaVersion: '1.0.0',
    metricId,
    metricKind: 'DERIVED',
    valueType: 'SIGNED_PERCENT',
    unit: 'PERCENT',
    status,
    value,
    generatedAt: '2026-08-11T00:00:00.000Z',
    period: {} as never,
    comparison: null,
    dataCoverage: null,
    sourceFreshness: null,
    calculationVersion: '2.0.0',
    exclusions: [],
    warnings,
  } as EvaluationsMetricResponse;
}

function bundle(metrics: Record<string, EvaluationsMetricResponse>): FinancialInsightsBundleDto {
  return { organizationId: 'ORG_A', period: {} as never, metrics };
}

const ids = FINANCE_CORE_METRIC_IDS;

describe('finance insights adapter (E3.2 canonical consumption)', () => {
  it('reads issued and paid revenue as distinct canonical metrics (no client mixing)', () => {
    const b = bundle({
      [ids.issuedRevenue]: money(ids.issuedRevenue, 'AVAILABLE', { amountMinor: 10000, currency: 'EUR' }),
      [ids.paidRevenue]: money(ids.paidRevenue, 'AVAILABLE', { amountMinor: 3000, currency: 'EUR' }),
    });
    expect(readMoneyMetric(b, ids.issuedRevenue).amountMinor).toBe(10000);
    expect(readMoneyMetric(b, ids.paidRevenue).amountMinor).toBe(3000);
  });

  it('formats money with the backend currency (no hardcoded EUR)', () => {
    const b = bundle({
      [ids.issuedRevenue]: money(ids.issuedRevenue, 'AVAILABLE', { amountMinor: 250000, currency: 'USD' }),
    });
    const view = readMoneyMetric(b, ids.issuedRevenue);
    expect(view.currency).toBe('USD');
    expect(formatFinanceMoney(view, 'en-US', { maximumFractionDigits: 0 })).toContain('$');
  });

  it('renders a status label (never false zero) for UNAVAILABLE money', () => {
    const b = bundle({
      [ids.issuedRevenue]: money(ids.issuedRevenue, 'UNAVAILABLE', null, ['MIXED_CURRENCY_NO_REPORTING_AUTHORITY']),
    });
    const view = readMoneyMetric(b, ids.issuedRevenue);
    expect(isMoneyAvailable(view)).toBe(false);
    expect(view.amountMinor).toBeNull();
    expect(formatFinanceMoney(view, 'en-US')).not.toContain('0');
  });

  it('formats an available zero as a real zero amount', () => {
    const b = bundle({
      [ids.issuedRevenue]: money(ids.issuedRevenue, 'AVAILABLE', { amountMinor: 0, currency: 'EUR' }),
    });
    expect(formatFinanceMoney(readMoneyMetric(b, ids.issuedRevenue), 'de-DE')).toMatch(/0/);
  });

  it('reads a negative signed margin', () => {
    const b = bundle({ [ids.profitMargin]: percent(ids.profitMargin, 'AVAILABLE', -50) });
    const view = readPercentMetric(b, ids.profitMargin);
    expect(view.value).toBe(-50);
    expect(formatFinancePercent(view, 1)).toBe('-50.0%');
  });

  it('renders NOT_APPLICABLE margin as n/a (not 0%)', () => {
    const b = bundle({ [ids.profitMargin]: percent(ids.profitMargin, 'NOT_APPLICABLE', null, ['ZERO_REVENUE_DENOMINATOR']) });
    expect(formatFinancePercent(readPercentMetric(b, ids.profitMargin), 1)).toBe('n/a');
  });

  it('reports MISSING when a metric is absent (no fabrication)', () => {
    const view = readMoneyMetric(bundle({}), ids.openReceivables);
    expect(view.status).toBe('MISSING');
    expect(view.amountMinor).toBeNull();
  });

  it('reads the partial-payment receivable/paid values from the backend as-is', () => {
    const b = bundle({
      [ids.paidRevenue]: money(ids.paidRevenue, 'AVAILABLE', { amountMinor: 3000, currency: 'EUR' }),
      [ids.openReceivables]: money(ids.openReceivables, 'AVAILABLE', { amountMinor: 7000, currency: 'EUR' }),
    });
    expect(readMoneyMetric(b, ids.paidRevenue).amountMinor).toBe(3000);
    expect(readMoneyMetric(b, ids.openReceivables).amountMinor).toBe(7000);
  });
});
