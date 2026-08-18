// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForHook } from '../../test/renderHook';
import { MasterDashboardView } from '../components/MasterDashboardView';
import { productionOperationalDashboardFixture } from './master-dashboard-fixtures';
import {
  __resetOperationalDashboardForTests,
  __setOperationalDashboardForTests,
} from './operational-cache';

vi.mock('../../lib/api', () => ({
  api: {
    admin: {
      dashboardOperational: vi.fn(),
    },
  },
}));

describe('MasterDashboardView render regression', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    __resetOperationalDashboardForTests();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    __resetOperationalDashboardForTests();
  });

  async function renderDashboard() {
    await act(async () => {
      root.render(createElement(MasterDashboardView, { onViewChange: vi.fn() }));
    });
    await waitForHook(() => container.textContent?.includes('Plattform-Übersicht') ?? false);
  }

  it('renders full production-shaped operational payload without crashing', async () => {
    __setOperationalDashboardForTests(productionOperationalDashboardFixture());
    await renderDashboard();
    expect(container.textContent).toContain('Plattform-Übersicht');
    expect(container.textContent).toContain('Aktive Vorfälle');
    expect(container.textContent).toContain('Organisationen mit Handlungsbedarf');
  });

  it('renders with optional modules null and empty arrays', async () => {
    __setOperationalDashboardForTests(
      productionOperationalDashboardFixture({
        incidents: [],
        incidentSummary: { count: 0, highestSeverity: null, affectedOrganizationCount: 0 },
        organizationsAttention: [],
        billing: null,
        connectivity: null,
        platformHealth: null,
        support: null,
        activity: [],
        businessContext: null,
        overallStatus: 'healthy',
        moduleErrors: { billing: 'timeout', platformHealth: 'unavailable' },
      }),
    );
    await renderDashboard();
    expect(container.textContent).toContain('Keine aktiven operativen Vorfälle');
    expect(container.textContent).toContain('Billing-Daten nicht verfügbar');
  });

  it('renders with missing optional billing fields', async () => {
    const billing = productionOperationalDashboardFixture().billing!;
    __setOperationalDashboardForTests(
      productionOperationalDashboardFixture({
        billing: {
          ...billing,
          failedPayments: undefined,
          reconciliationDrifts: undefined,
          failedEmailDeliveries: undefined,
        },
      }),
    );
    await renderDashboard();
    expect(container.textContent).toContain('Abrechnung');
  });

  it('renders with unknown overall status and no incidents', async () => {
    __setOperationalDashboardForTests(
      productionOperationalDashboardFixture({
        overallStatus: 'unknown',
        incidents: [],
        incidentSummary: { count: 0, highestSeverity: null, affectedOrganizationCount: 0 },
      }),
    );
    await renderDashboard();
    expect(container.textContent).toContain('Unbekannt');
  });

  it('does not infinite re-render when subscribed via useSyncExternalStore', async () => {
    let renderCount = 0;
    function Probe() {
      renderCount += 1;
      return createElement(MasterDashboardView, { onViewChange: vi.fn() });
    }
    __setOperationalDashboardForTests(productionOperationalDashboardFixture());
    await act(async () => {
      root.render(createElement(Probe));
    });
    await waitForHook(() => (container.textContent?.includes('Plattform-Übersicht') ?? false));
    const afterLoad = renderCount;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(renderCount - afterLoad).toBeLessThan(5);
  });
});
