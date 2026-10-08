// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { ConnectedVehiclesHub } from './ConnectedVehiclesHub';
import { CONNECTED_VEHICLES_REFRESH_EVENT } from './useConnectedVehiclesOperational';
import { minimalOperationalDetailFixture } from './test-fixtures/operational-detail.fixture';

const overviewRefresh = vi.fn();
const detailRefresh = vi.fn();
const executeMock = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('./useVehicleOffboard', () => ({
  useVehicleOffboard: () => ({
    execute: executeMock,
    state: { phase: 'idle' },
    clear: vi.fn(),
    abandonPending: vi.fn(),
    retryAfterMfa: vi.fn(),
    retryUncertain: vi.fn(),
    isSubmitting: false,
  }),
}));

vi.mock('./useConnectedVehiclesOperational', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useConnectedVehiclesOperational')>();
  return {
    ...actual,
    useConnectedVehiclesList: () => ({
      query: { registryLifecycle: 'ACTIVE' },
      data: { data: [], meta: { total: 0, page: 1, limit: 25, totalPages: 0 } },
      loading: false,
      error: null,
      setQuery: vi.fn(),
      refresh: vi.fn(),
    }),
    useConnectedVehiclesOverview: () => ({
      overview: { counts: { registered: 1 } },
      loading: false,
      error: null,
      refresh: overviewRefresh,
    }),
    useConnectedVehicleDetail: () => ({
      detail: minimalOperationalDetailFixture,
      refresh: detailRefresh,
      loading: false,
      error: null,
      diagnostics: null,
      diagnosticsLoading: false,
      diagnosticsError: null,
      loadDiagnostics: vi.fn(),
    }),
  };
});

vi.mock('./vo5c-release-gates', () => ({
  isMasterOffboardUiEnabled: () => true,
}));

describe('ConnectedVehiclesHub offboard refresh (VO5C-P2A.2)', () => {
  beforeEach(() => {
    overviewRefresh.mockClear();
    detailRefresh.mockClear();
    executeMock.mockReset();
    window.history.pushState({}, '', '?cvSection=vehicles&vehicleId=veh-1');
  });

  it('successful offboard refreshes overview, list event, and detail', async () => {
    executeMock.mockResolvedValue({
      vehicleId: 'veh-1',
      organizationId: 'org-1',
      registryLifecycle: 'OFFBOARDED',
      idempotentReplay: false,
      warnings: [],
    });

    const emitSpy = vi.fn();
    window.addEventListener(CONNECTED_VEHICLES_REFRESH_EVENT, emitSpy);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(LanguageProvider, {
          children: createElement(ConnectedVehiclesHub, { organizations: [] }),
        }),
      );
    });

    const hub = container.querySelector('[data-testid="connected-vehicles-hub"]');
    expect(hub).toBeTruthy();

    const offboardBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      /entfernen|Remove from active fleet/i.test(b.textContent ?? ''),
    );
    expect(offboardBtn).toBeTruthy();

    await act(async () => {
      offboardBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const confirmBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      /Ausbuchung bestätigen|Confirm offboard/i.test(b.textContent ?? ''),
    );
    expect(confirmBtn).toBeTruthy();

    await act(async () => {
      confirmBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(executeMock).toHaveBeenCalled();
    expect(overviewRefresh).toHaveBeenCalled();
    expect(detailRefresh).toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalled();

    root.unmount();
    container.remove();
    window.removeEventListener(CONNECTED_VEHICLES_REFRESH_EVENT, emitSpy);
  });
});
