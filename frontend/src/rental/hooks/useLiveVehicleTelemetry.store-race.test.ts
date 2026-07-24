// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '../../test/renderHook';
import { api } from '../../lib/api';
import { useLiveVehicleTelemetry } from './useLiveVehicleTelemetry';
import {
  resolveVehicleDetailPollingGates,
  VEHICLE_DETAIL_POLLING,
} from '../lib/vehicle-detail-polling-policy';
import { useVehicleLiveMapStore } from '../stores/useVehicleLiveMapStore';
import { useVehicleDetailPollingStore } from '../stores/useVehicleDetailPollingStore';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      vehicles: {
        ...actual.api.vehicles,
        liveGps: vi.fn(),
        telemetry: vi.fn(),
      },
    },
  };
});

const liveGps = vi.mocked(api.vehicles.liveGps);
const telemetry = vi.mocked(api.vehicles.telemetry);

function gates(overrides: Partial<ReturnType<typeof resolveVehicleDetailPollingGates>> = {}) {
  return {
    ...resolveVehicleDetailPollingGates({
      vehicleId: 'veh-1',
      orgId: 'org-1',
      isVehicleDetailOpen: true,
      isOverviewTab: true,
      isOverviewMapVisible: true,
      isDocumentVisible: true,
      isOnline: true,
      canReadFleet: true,
      accessBlockReason: null,
    }),
    ...overrides,
  };
}

describe('useLiveVehicleTelemetry store race conditions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    useVehicleLiveMapStore.getState().reset();
    useVehicleDetailPollingStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps dashboard snapshot when slow old GPS response arrives later', async () => {
    const dashboard = {
      latitude: 51.1,
      longitude: 9.4,
      fuel: 42,
      isLiveTracking: true,
      lastSignal: '2026-07-24T10:05:00.000Z',
      measuredAt: '2026-07-24T10:05:00.000Z',
      onlineStatus: 'ONLINE',
      displayState: 'MOVING',
      displayIgnition: 'ON',
    } as const;

    let resolveOldGps!: (value: unknown) => void;
    telemetry.mockResolvedValue(dashboard as never);
    liveGps.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOldGps = resolve;
        }) as never,
    );

    renderHook(() =>
      useLiveVehicleTelemetry({
        vehicleId: 'veh-1',
        orgId: 'org-1',
        gates: gates(),
      }),
    );

    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();

    expect(useVehicleLiveMapStore.getState().snapshot?.fuel).toBe(42);

    resolveOldGps({
      latitude: 51.2,
      longitude: 9.5,
      speedKmh: 30,
      source: 'dimo',
      measuredAt: '2026-07-24T10:04:00.000Z',
      receivedAt: '2026-07-24T10:04:01.000Z',
      lastSeenAt: '2026-07-24T10:04:00.000Z',
    });
    await Promise.resolve();

    const state = useVehicleLiveMapStore.getState();
    expect(state.snapshot?.fuel).toBe(42);
    expect(state.targetPosition).toBeNull();
  });

  it('merges GPS and dashboard concurrently without deleting independent fields', async () => {
    telemetry.mockResolvedValue({
      latitude: 51.1,
      longitude: 9.4,
      fuel: 60,
      isLiveTracking: true,
      lastSignal: '2026-07-24T10:05:00.000Z',
      measuredAt: '2026-07-24T10:05:00.000Z',
      onlineStatus: 'ONLINE',
      displayState: 'MOVING',
      displayIgnition: 'ON',
    } as never);

    liveGps.mockResolvedValue({
      latitude: 51.11,
      longitude: 9.41,
      speedKmh: 18,
      source: 'dimo',
      measuredAt: '2026-07-24T10:06:00.000Z',
      receivedAt: '2026-07-24T10:06:01.000Z',
      lastSeenAt: '2026-07-24T10:06:00.000Z',
    } as never);

    renderHook(() =>
      useLiveVehicleTelemetry({
        vehicleId: 'veh-1',
        orgId: 'org-1',
        gates: gates(),
      }),
    );

    await vi.runOnlyPendingTimersAsync();
    await vi.advanceTimersByTimeAsync(VEHICLE_DETAIL_POLLING.GPS_MS);
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();

    const state = useVehicleLiveMapStore.getState();
    expect(state.snapshot?.fuel).toBe(60);
    expect(state.targetPosition).toEqual([9.41, 51.11]);
    expect(state.displayState).toBe('MOVING');
  });

  it('drops in-flight response after fast vehicle switch', async () => {
    let resolveSlowDashboard!: (value: unknown) => void;
    telemetry.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSlowDashboard = resolve;
        }) as never,
    );

    const { rerender } = renderHook(
      ({ vehicleId }) =>
        useLiveVehicleTelemetry({
          vehicleId,
          orgId: 'org-1',
          gates: gates(),
        }),
      { initialProps: { vehicleId: 'veh-1' as string | null } },
    );

    await Promise.resolve();
    rerender({ vehicleId: 'veh-2' });
    telemetry.mockResolvedValue({
      latitude: 88,
      longitude: 88,
      fuel: 99,
      isLiveTracking: false,
      lastSignal: new Date().toISOString(),
      onlineStatus: 'ONLINE',
    } as never);

    resolveSlowDashboard({
      latitude: 51.1,
      longitude: 9.4,
      fuel: 11,
      isLiveTracking: false,
      lastSignal: new Date().toISOString(),
      onlineStatus: 'ONLINE',
    });
    await Promise.resolve();

    const state = useVehicleLiveMapStore.getState();
    expect(state.boundVehicleId).toBe('veh-2');
    expect(state.snapshot?.fuel).not.toBe(11);
  });

  it('clears store when org becomes empty', async () => {
    const { rerender } = renderHook(
      ({ orgId }) =>
        useLiveVehicleTelemetry({
          vehicleId: 'veh-1',
          orgId,
          gates: gates({ orgId }),
        }),
      { initialProps: { orgId: 'org-1' } },
    );

    telemetry.mockResolvedValue({
      latitude: 51.1,
      longitude: 9.4,
      fuel: 33,
      isLiveTracking: false,
      lastSignal: new Date().toISOString(),
      onlineStatus: 'ONLINE',
    } as never);

    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(useVehicleLiveMapStore.getState().snapshot?.fuel).toBe(33);

    rerender({ orgId: '' });
    await Promise.resolve();

    const state = useVehicleLiveMapStore.getState();
    expect(state.boundVehicleId).toBeNull();
    expect(state.boundOrgId).toBeNull();
    expect(state.snapshot).toBeNull();
  });

  it('aborts and retries without writing stale data after reset during request', async () => {
    let rejectDashboard!: (reason?: unknown) => void;
    telemetry
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectDashboard = reject;
          }) as never,
      )
      .mockResolvedValueOnce({
        latitude: 51.1,
        longitude: 9.4,
        fuel: 77,
        isLiveTracking: false,
        lastSignal: new Date().toISOString(),
        onlineStatus: 'ONLINE',
      } as never);

    const { unmount } = renderHook(() =>
      useLiveVehicleTelemetry({
        vehicleId: 'veh-1',
        orgId: 'org-1',
        gates: gates(),
      }),
    );

    await Promise.resolve();
    rejectDashboard(new DOMException('Aborted', 'AbortError'));
    unmount();
    await Promise.resolve();

    expect(useVehicleLiveMapStore.getState().boundVehicleId).toBeNull();
  });
});
