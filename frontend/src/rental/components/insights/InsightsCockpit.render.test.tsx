// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinanceMoneyView } from '../../lib/finance-insights-adapter';

vi.mock('../../DashboardInsightsContext', () => ({
  useDashboardInsights: () => ({
    response: { insights: [], hasRun: true, stale: false },
    loading: false,
    error: null,
  }),
}));
vi.mock('../../FleetContext', () => ({
  useFleetVehicles: () => ({ fleetVehicles: [] }),
}));
vi.mock('../../RentalContext', () => ({
  useRentalOrg: () => ({ orgId: 'org-1' }),
}));
vi.mock('../../../lib/api', () => ({
  api: { misuseCases: { list: vi.fn(async () => ({ data: [] })) } },
}));

import { InsightsCockpit } from './InsightsCockpit';

function moneyView(v: Partial<FinanceMoneyView>): FinanceMoneyView {
  return { status: 'AVAILABLE', amountMinor: 0, currency: 'EUR', reason: null, ...v };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

async function render(openReceivables: FinanceMoneyView | null) {
  await act(async () => {
    root.render(createElement(InsightsCockpit, { isDarkMode: false, openReceivables }));
    // flush the misuse-cases async state update
    await Promise.resolve();
  });
}

describe('InsightsCockpit render (E3.5 acceptance)', () => {
  it('UNAVAILABLE open receivables does not render a false 0 €', async () => {
    await render(
        moneyView({ status: 'UNAVAILABLE', amountMinor: null, currency: null, reason: 'STATION_SCOPED_FINANCE_UNSUPPORTED' }),
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Offene Forderungen');
    expect(text).not.toContain('0 €');
    expect(text).not.toContain('€0');
    // status label rendered instead of a fabricated amount
    expect(text).toContain('—');
  });

  it('renders JPY open receivables as JPY (no € relabel)', async () => {
    await render(moneyView({ status: 'AVAILABLE', amountMinor: 100, currency: 'JPY', reason: null }));
    const text = container.textContent ?? '';
    expect(text).toMatch(/100/);
    // The JPY money value must not be shown with a euro sign.
    expect(text).toContain('Offene Forderungen');
    expect(text).not.toMatch(/100\s*€/);
  });

  it('renders KWD open receivables with 3 decimals (no /100)', async () => {
    await render(moneyView({ status: 'AVAILABLE', amountMinor: 1000, currency: 'KWD', reason: null }));
    const text = container.textContent ?? '';
    expect(text).toMatch(/1[.,]000/);
    expect(text).not.toMatch(/(^|\D)10(\D|$)\s*€/);
  });

  it('does not render a monetary "Finanzrisiko (geschätzt)" € card (E3.5 removal)', async () => {
    await render(moneyView({ status: 'AVAILABLE', amountMinor: 12345, currency: 'EUR', reason: null }));
    const text = container.textContent ?? '';
    expect(text).not.toContain('Finanzrisiko (geschätzt)');
    expect(text).not.toMatch(/≈\s*\d[\d.,]*\s*€\s*Risiko/);
  });
});
