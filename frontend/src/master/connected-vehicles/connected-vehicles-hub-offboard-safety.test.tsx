// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { ConnectedVehiclesHub } from './ConnectedVehiclesHub';
import { CONNECTED_VEHICLES_REFRESH_EVENT } from './useConnectedVehiclesOperational';
import { minimalOperationalDetailFixture } from './test-fixtures/operational-detail.fixture';
import { VehicleOffboardRequestError } from '../../lib/vehicle-offboard-api-error';
import { toast } from 'sonner';

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

async function confirmOffboardFromDrawer() {
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
}

describe('ConnectedVehiclesHub offboard safety (VO5C-P2A.3)', () => {
  beforeEach(() => {
    overviewRefresh.mockClear();
    detailRefresh.mockClear();
    executeMock.mockReset();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.warning).mockClear();
    window.history.pushState({}, '', '?cvSection=vehicles&vehicleId=veh-1');
  });

  it('operational block — no success toast or success refresh', async () => {
    executeMock.mockRejectedValue(
      new VehicleOffboardRequestError('blocked', {
        kind: 'OPERATIONALLY_BLOCKED',
        code: 'OFFBOARD_OPERATIONALLY_BLOCKED',
        status: 422,
        details: { blockingReasons: ['ACTIVE_RENTAL'] },
      }),
    );

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

    await confirmOffboardFromDrawer();

    expect(executeMock).toHaveBeenCalled();
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
    expect(overviewRefresh).not.toHaveBeenCalled();
    expect(detailRefresh).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
    expect(vi.mocked(toast.error)).toHaveBeenCalled();

    root.unmount();
    container.remove();
    window.removeEventListener(CONNECTED_VEHICLES_REFRESH_EVENT, emitSpy);
  });

  it('transport uncertain — warning toast, no success refresh', async () => {
    executeMock.mockRejectedValue(
      new VehicleOffboardRequestError('Network error', {
        kind: 'TRANSPORT_UNCERTAIN',
        code: 'TRANSPORT_UNCERTAIN',
        status: 0,
      }),
    );

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

    await confirmOffboardFromDrawer();

    expect(vi.mocked(toast.warning)).toHaveBeenCalled();
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
    expect(overviewRefresh).not.toHaveBeenCalled();
    expect(detailRefresh).not.toHaveBeenCalled();

    root.unmount();
    container.remove();
  });

  it('stale response — no success or failure toast', async () => {
    executeMock.mockRejectedValue(
      new VehicleOffboardRequestError('stale', {
        kind: 'HTTP_REJECTION',
        code: 'OFFBOARD_STALE_RESPONSE',
        status: 0,
      }),
    );

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

    await confirmOffboardFromDrawer();

    expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
    expect(vi.mocked(toast.warning)).not.toHaveBeenCalled();

    root.unmount();
    container.remove();
  });
});
