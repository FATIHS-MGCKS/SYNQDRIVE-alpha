// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FleetHealthServiceRefreshProvider,
  useFleetHealthServiceRefresh,
} from './FleetHealthServiceRefreshContext';
import { resetCoordinatedRefreshCoordinator } from './fleet-health-service-refresh-coordinator';

const reloadHealth = vi.fn(async () => undefined);
const refreshFleetRuntime = vi.fn(async () => undefined);
const reloadTaskSummary = vi.fn(async () => undefined);
const reloadTasks = vi.fn(async () => undefined);
const reloadVendors = vi.fn(async () => undefined);
const reloadServiceCases = vi.fn(async () => undefined);

vi.mock('../../FleetContext', () => ({
  useFleetVehicles: () => ({
    reloadHealth,
    refresh: refreshFleetRuntime,
    fleetVehicles: [],
    healthMap: new Map(),
    healthLoading: false,
  }),
}));

vi.mock('../../RentalContext', () => ({
  useRentalOrg: () => ({ orgId: 'org-1' }),
}));

vi.mock('../service-center/useServiceCenterData', () => ({
  useServiceCenterData: () => ({
    taskSummary: { reload: reloadTaskSummary, status: 'ready', data: null, error: null, fetchedAt: null },
    tasks: { reload: reloadTasks, status: 'ready', data: [{ id: 't1' }], error: null, fetchedAt: null },
    vendors: { reload: reloadVendors, status: 'ready', data: [], error: null, fetchedAt: null },
    serviceCases: { reload: reloadServiceCases, status: 'ready', data: [], error: null, fetchedAt: null },
    summary: null,
    allTasks: [{ id: 't1' }],
    activeTasks: [{ id: 't1' }],
    historyTasks: [],
    vendorsError: null,
    vendorsStatus: 'ready',
    vendorsFetchedAt: null,
    kpis: { dataReady: true },
    loading: false,
    error: null,
    reload: vi.fn(),
    reloadVendors,
    partialData: false,
  }),
}));

function renderRefreshHook() {
  const bag: { current: ReturnType<typeof useFleetHealthServiceRefresh> | undefined } = {
    current: undefined,
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  function Probe() {
    bag.current = useFleetHealthServiceRefresh();
    return null;
  }

  act(() => {
    root.render(
      createElement(FleetHealthServiceRefreshProvider, { enabled: true }, createElement(Probe)),
    );
  });

  return {
    result: bag,
    unmount: () =>
      act(() => {
        root.unmount();
        container.remove();
      }),
  };
}

describe('FleetHealthServiceRefreshProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCoordinatedRefreshCoordinator();
  });

  afterEach(() => {
    resetCoordinatedRefreshCoordinator();
  });

  it('runs unified refresh across all sources and exposes partial failures', async () => {
    reloadVendors.mockRejectedValueOnce(new Error('vendors failed'));

    const { result, unmount } = renderRefreshHook();

    await act(async () => {
      const refreshResult = await result.current!.reloadAll();
      expect(refreshResult.partial).toBe(true);
      expect(refreshResult.allSucceeded).toBe(false);
      expect(refreshResult.results.find((entry) => entry.source === 'vendors')?.status).toBe(
        'rejected',
      );
      expect(refreshResult.results.find((entry) => entry.source === 'tasks')?.status).toBe(
        'fulfilled',
      );
    });

    expect(reloadHealth).toHaveBeenCalledTimes(1);
    expect(refreshFleetRuntime).toHaveBeenCalledTimes(1);
    expect(reloadTaskSummary).toHaveBeenCalledTimes(1);
    expect(reloadTasks).toHaveBeenCalledTimes(1);
    expect(reloadVendors).toHaveBeenCalledTimes(1);
    expect(reloadServiceCases).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('deduplicates concurrent reloadAll calls', async () => {
    const { result, unmount } = renderRefreshHook();

    await act(async () => {
      const first = result.current!.reloadAll();
      const second = result.current!.reloadAll();
      expect(first).toBe(second);
      await first;
    });

    expect(reloadTasks).toHaveBeenCalledTimes(1);
    unmount();
  });
});
