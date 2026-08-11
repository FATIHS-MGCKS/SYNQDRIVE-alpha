import { describe, expect, it } from 'vitest';
import type { EvaluationsMetricResponse } from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import type { FinancialInsightsBundleDto } from './finance-insights.types';
import { FINANCE_CORE_METRIC_IDS, buildFinanceInsightsPath } from './finance-insights.types';
import {
  formatFinanceMoney,
  formatFinancePercent,
  formatRawMoney,
  isMoneyAvailable,
  minorToMajorForPresentation,
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

  describe('ISO-4217 money presentation (E3.3, no hardcoded /100)', () => {
    it.each([
      ['EUR', 12345, 123.45],
      ['USD', 12345, 123.45],
      ['JPY', 100, 100],
      ['KWD', 1000, 1],
      ['EUR', -5000, -50],
      ['EUR', 0, 0],
    ])('%s %d minor → %f major', (currency, minor, major) => {
      expect(minorToMajorForPresentation(minor as number, currency as string)).toBeCloseTo(
        major as number,
        6,
      );
    });

    function moneyView(amountMinor: number, currency: string) {
      return bundle({
        [ids.issuedRevenue]: money(ids.issuedRevenue, 'AVAILABLE', { amountMinor, currency }),
      });
    }

    it('formats JPY without a 2-decimal /100 error (100 minor = 100 JPY)', () => {
      const out = formatFinanceMoney(readMoneyMetric(moneyView(100, 'JPY'), ids.issuedRevenue), 'en-US');
      expect(out).toMatch(/100/);
      expect(out).not.toMatch(/1\.00\b/);
    });

    it('formats KWD with 3 decimals (1000 minor = 1.000 KWD, not 10)', () => {
      const out = formatFinanceMoney(readMoneyMetric(moneyView(1000, 'KWD'), ids.issuedRevenue), 'en-US');
      expect(out).toMatch(/1\.000/);
      expect(out).not.toMatch(/(^|\D)10(\D|$)/);
    });

    it('formats negative EUR without absolute-value accident', () => {
      const out = formatFinanceMoney(readMoneyMetric(moneyView(-5000, 'EUR'), ids.issuedRevenue), 'en-US');
      expect(out).toMatch(/-/);
      expect(out).toMatch(/50/);
    });

    it('returns a guarded state for an invalid currency (no crash, no /100 guess)', () => {
      const out = formatFinanceMoney(
        readMoneyMetric(moneyView(12345, 'ZZZ'), ids.issuedRevenue),
        'en-US',
      );
      expect(out).toBe('Fehler');
    });
  });

  describe('E3.4 core money precision (currency-native fraction digits, no false zero)', () => {
    function view(amountMinor: number, currency: string) {
      return readMoneyMetric(
        bundle({ [ids.issuedRevenue]: money(ids.issuedRevenue, 'AVAILABLE', { amountMinor, currency }) }),
        ids.issuedRevenue,
      );
    }
    it('shows 0.49 EUR for 49 minor (no visual rounding to 0)', () => {
      const out = formatFinanceMoney(view(49, 'EUR'), 'en-US');
      expect(out).toMatch(/0\.49/);
      expect(out).not.toBe('€0');
    });
    it('shows -0.49 EUR for -49 minor (sign + precision)', () => {
      const out = formatFinanceMoney(view(-49, 'EUR'), 'en-US');
      expect(out).toMatch(/-/);
      expect(out).toMatch(/0\.49/);
    });
    it('shows 1.234 KWD for 1234 minor', () => {
      expect(formatFinanceMoney(view(1234, 'KWD'), 'en-US')).toMatch(/1\.234/);
    });
  });

  describe('E3.4 raw money formatter (Recent Activity, per-invoice currency)', () => {
    it('formats USD without EUR relabel', () => {
      const out = formatRawMoney(10000, 'USD', 'en-US');
      expect(out).toContain('$');
      expect(out).toMatch(/100\.00/);
      expect(out).not.toContain('€');
    });
    it('formats JPY (0 decimals) and KWD (3 decimals) correctly', () => {
      expect(formatRawMoney(100, 'JPY', 'en-US')).toMatch(/100/);
      expect(formatRawMoney(1000, 'KWD', 'en-US')).toMatch(/1\.000/);
    });
    it('missing currency → guarded label (no EUR guess)', () => {
      expect(formatRawMoney(10000, null, 'en-US')).toBe('—');
    });
    it('invalid currency → guarded label (no crash, no /100)', () => {
      expect(formatRawMoney(10000, 'ZZZ', 'en-US')).toBe('Fehler');
    });
  });

  describe('E3.4 cockpit money model (status-aware, no false zero, currency-correct)', () => {
    it('UNAVAILABLE open receivables renders a status label, never 0 €', () => {
      const v = readMoneyMetric(
        bundle({
          [ids.openReceivables]: money(ids.openReceivables, 'UNAVAILABLE', null, [
            'STATION_SCOPED_FINANCE_UNSUPPORTED',
          ]),
        }),
        ids.openReceivables,
      );
      const shown = formatFinanceMoney(v, 'de-DE');
      expect(shown).toBe('—');
      expect(shown).not.toMatch(/0/);
    });
    it('JPY open receivables renders as JPY (not €)', () => {
      const v = readMoneyMetric(
        bundle({ [ids.openReceivables]: money(ids.openReceivables, 'AVAILABLE', { amountMinor: 100, currency: 'JPY' }) }),
        ids.openReceivables,
      );
      const shown = formatFinanceMoney(v, 'en-US');
      expect(shown).toMatch(/100/);
      expect(shown).not.toContain('€');
    });
  });

  describe('station scope request path (E3.3)', () => {
    it('includes the requested station narrowing when a station is selected', () => {
      expect(buildFinanceInsightsPath('ORG_A', ['st-1'])).toBe(
        '/organizations/ORG_A/evaluations/finance/insights?stationIds=st-1',
      );
    });
    it('omits any station filter when none is selected (org-wide)', () => {
      expect(buildFinanceInsightsPath('ORG_A')).toBe(
        '/organizations/ORG_A/evaluations/finance/insights',
      );
      expect(buildFinanceInsightsPath('ORG_A', [])).toBe(
        '/organizations/ORG_A/evaluations/finance/insights',
      );
    });
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
