// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EvaluationsMetricResponse } from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import type { FinancialInsightsBundleDto } from '../lib/finance-insights.types';
import { FINANCE_CORE_METRIC_IDS } from '../lib/finance-insights.types';

// ── Mutable mock state ──────────────────────────────────────────────────────
let stationFilterValue = 'all';
const invoicesList = vi.fn();
const customersList = vi.fn();
const financeInsights = vi.fn();
const misuseList = vi.fn(async (_orgId?: string, _params?: unknown) => ({ data: [] }));

vi.mock('../../lib/api', () => ({
  api: {
    invoices: { list: (orgId: string) => invoicesList(orgId) },
    customers: { list: (orgId: string) => customersList(orgId) },
    evaluations: {
      financeInsights: (orgId: string, stationIds?: string[]) => financeInsights(orgId, stationIds),
    },
    misuseCases: { list: (orgId: string, params?: unknown) => misuseList(orgId, params) },
  },
}));
vi.mock('../RentalContext', () => ({ useRentalOrg: () => ({ orgId: 'org-1' }) }));
vi.mock('../FleetContext', () => ({ useFleetVehicles: () => ({ fleetVehicles: [] }) }));
vi.mock('../i18n/LanguageContext', () => ({
  useLanguage: () => ({ t: (k: string) => k, locale: 'de' }),
}));
vi.mock('../stores/useFleetMapStore', () => ({
  ALL_STATIONS_FILTER: 'all',
  NO_STATION_FILTER: '__none__',
  NO_LOCATION_FILTER: '__noloc__',
  useFleetMapStore: (selector: (s: unknown) => unknown) =>
    selector({ filters: { stationId: stationFilterValue } }),
}));
vi.mock('./dashboard/dashboardUtils', () => ({ filterFleetByStation: () => [] }));
vi.mock('./insights/InsightsCockpit', () => ({
  InsightsCockpit: () => createElement('div', { 'data-testid': 'cockpit-stub' }),
}));
vi.mock('./ui/Icon', () => ({ Icon: () => createElement('span') }));
vi.mock('../../components/patterns', () => ({
  PageHeader: ({ title }: { title: string }) => createElement('h1', null, title),
}));
vi.mock('recharts', () => {
  const Stub = ({ children }: { children?: unknown }) => createElement('div', null, children as never);
  return {
    Area: Stub, AreaChart: Stub, CartesianGrid: Stub, ResponsiveContainer: Stub,
    Tooltip: Stub, XAxis: Stub, YAxis: Stub,
  };
});

import { FinancialInsightsView } from './FinancialInsightsView';

function money(
  metricId: string,
  status: EvaluationsMetricResponse['status'],
  value: { amountMinor: number; currency: string } | null,
  warnings: string[] = [],
): EvaluationsMetricResponse {
  return {
    schemaVersion: '1.0.0', metricId, metricKind: 'OBSERVED', valueType: 'MONEY',
    unit: 'CURRENCY_MINOR', status, value, generatedAt: '2026-08-11T00:00:00.000Z',
    period: {} as never, comparison: null, dataCoverage: null, sourceFreshness: null,
    calculationVersion: '2.0.0', exclusions: [], warnings,
  } as EvaluationsMetricResponse;
}
function percent(status: EvaluationsMetricResponse['status'], value: number | null): EvaluationsMetricResponse {
  return {
    schemaVersion: '1.0.0', metricId: FINANCE_CORE_METRIC_IDS.profitMargin, metricKind: 'DERIVED',
    valueType: 'SIGNED_PERCENT', unit: 'PERCENT', status, value, generatedAt: '2026-08-11T00:00:00.000Z',
    period: {} as never, comparison: null, dataCoverage: null, sourceFreshness: null,
    calculationVersion: '2.0.0', exclusions: [], warnings: [],
  } as EvaluationsMetricResponse;
}
function bundle(currency: string, status: EvaluationsMetricResponse['status'] = 'AVAILABLE', warnings: string[] = []): FinancialInsightsBundleDto {
  const ids = FINANCE_CORE_METRIC_IDS;
  const m = (id: string, amt: number) =>
    money(id, status, status === 'AVAILABLE' ? { amountMinor: amt, currency } : null, warnings);
  return {
    organizationId: 'org-1',
    period: {} as never,
    metrics: {
      [ids.issuedRevenue]: m(ids.issuedRevenue, 100000),
      [ids.paidRevenue]: m(ids.paidRevenue, 30000),
      [ids.expenses]: m(ids.expenses, 40000),
      [ids.netResult]: m(ids.netResult, 60000),
      [ids.openReceivables]: m(ids.openReceivables, 70000),
      [ids.overdueReceivables]: m(ids.overdueReceivables, 5000),
      [ids.totalOutstanding]: m(ids.totalOutstanding, 75000),
      [ids.profitMargin]: status === 'AVAILABLE' ? percent('AVAILABLE', 60) : percent(status, null),
    },
  };
}

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  stationFilterValue = 'all';
  invoicesList.mockReset();
  customersList.mockReset();
  financeInsights.mockReset();
  customersList.mockResolvedValue([]);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

async function renderView() {
  await act(async () => {
    root.render(createElement(FinancialInsightsView, { isDarkMode: false }));
  });
  // flush load() microtasks (invoices/customers/finance)
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}

describe('FinancialInsightsView render acceptance (E3.5)', () => {
  it('invoice fetch fails but canonical Finance succeeds → Core cards still render', async () => {
    invoicesList.mockRejectedValue(new Error('invoice boom'));
    financeInsights.mockResolvedValue(bundle('EUR'));
    await renderView();
    const text = container.textContent ?? '';
    expect(text).toContain('Issued Revenue MTD');
    // canonical EUR value visible (100000 minor → 1.000,00 € de-DE); not a collapse
    expect(text).toMatch(/1\.000/);
    // invoice error is a non-blocking banner, page not replaced
    expect(financeInsights).toHaveBeenCalled();
  });

  it('finance fails but invoices succeed → Core KPIs are NOT reconstructed (unavailable)', async () => {
    invoicesList.mockResolvedValue([]);
    financeInsights.mockRejectedValue(new Error('finance boom'));
    await renderView();
    const text = container.textContent ?? '';
    expect(text).toContain('Issued Revenue MTD');
    // MISSING bundle → adapter renders the unavailable label, never a fabricated 0
    expect(text).not.toContain('0 €');
    expect(text).not.toContain('€0');
  });

  it('USD bundle → Core cards use USD (no € relabel)', async () => {
    invoicesList.mockResolvedValue([]);
    financeInsights.mockResolvedValue(bundle('USD'));
    await renderView();
    const text = container.textContent ?? '';
    expect(text).toMatch(/US-?\$|\$/);
  });

  it('station selected + station-scoped finance UNAVAILABLE → no false 0, no org fallback', async () => {
    stationFilterValue = 'station-A';
    invoicesList.mockResolvedValue([]);
    financeInsights.mockResolvedValue(bundle('EUR', 'UNAVAILABLE', ['STATION_SCOPED_FINANCE_UNSUPPORTED']));
    await renderView();
    const text = container.textContent ?? '';
    expect(financeInsights).toHaveBeenCalledWith('org-1', ['station-A']);
    expect(text).not.toContain('0 €');
    expect(text).not.toContain('€0');
  });
});
