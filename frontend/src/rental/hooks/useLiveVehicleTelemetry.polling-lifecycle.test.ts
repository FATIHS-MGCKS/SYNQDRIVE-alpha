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

describe('useLiveVehicleTelemetry polling lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    useVehicleLiveMapStore.getState().reset();
    useVehicleDetailPollingStore.getState().reset();

    telemetry.mockResolvedValue({
      latitude: 51.1,
      longitude: 9.4,
      isLiveTracking: true,
      lastSignal: new Date().toISOString(),
      onlineStatus: 'ONLINE',
      displayState: 'MOVING',
      displayIgnition: 'ON',
    } as never);

    liveGps.mockResolvedValue({
      latitude: 51.11,
      longitude: 9.41,
      speedKmh: 12,
      source: 'dimo',
      measuredAt: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls dashboard on Overview and GPS when live-tracking', async () => {
    renderHook(() =>
      useLiveVehicleTelemetry({
        vehicleId: 'veh-1',
        orgId: 'org-1',
        gates: gates(),
      }),
    );

    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(telemetry.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(liveGps.mock.calls.length).toBeGreaterThanOrEqual(1);

    liveGps.mockClear();
    await vi.advanceTimersByTimeAsync(VEHICLE_DETAIL_POLLING.GPS_MS);
    await Promise.resolve();
    expect(liveGps).toHaveBeenCalled();
  });

  it('does not poll GPS on non-Overview tabs', async () => {
    const { rerender } = renderHook(
      ({ g }) =>
        useLiveVehicleTelemetry({
          vehicleId: 'veh-1',
          orgId: 'org-1',
          gates: g,
        }),
      { initialProps: { g: gates({ gpsHighFrequency: false, dashboardIntervalMs: 90_000 }) } },
    );

    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(telemetry.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(liveGps).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(VEHICLE_DETAIL_POLLING.GPS_MS);
    expect(liveGps).not.toHaveBeenCalled();

    rerender({ g: gates() });
    await vi.runOnlyPendingTimersAsync();
    expect(liveGps).toHaveBeenCalled();
  });

  it('pauses dashboard polling when document hidden gate closes', async () => {
    const { rerender } = renderHook(
      ({ g }) =>
        useLiveVehicleTelemetry({
          vehicleId: 'veh-1',
          orgId: 'org-1',
          gates: g,
        }),
      { initialProps: { g: gates() } },
    );

    await vi.runOnlyPendingTimersAsync();
    telemetry.mockClear();

    rerender({ g: gates({ dashboardTelemetry: false, gpsHighFrequency: false }) });
    await vi.advanceTimersByTimeAsync(VEHICLE_DETAIL_POLLING.DASHBOARD_OVERVIEW_MS);
    expect(telemetry).not.toHaveBeenCalled();
  });

  it('cleans up timers on unmount and does not request after vehicle change', async () => {
    const { rerender } = renderHook(
      ({ vehicleId }) =>
        useLiveVehicleTelemetry({
          vehicleId,
          orgId: 'org-1',
          gates: gates(),
        }),
      { initialProps: { vehicleId: 'veh-1' as string | null } },
    );

    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    telemetry.mockClear();
    liveGps.mockClear();

    rerender({ vehicleId: 'veh-2' });
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(telemetry).toHaveBeenCalledWith(
      'org-1',
      'veh-2',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    rerender({ vehicleId: null });
    await vi.runOnlyPendingTimersAsync();
    telemetry.mockClear();
    liveGps.mockClear();

    await vi.advanceTimersByTimeAsync(VEHICLE_DETAIL_POLLING.GPS_MS * 3);
    await Promise.resolve();
    expect(liveGps).not.toHaveBeenCalled();
    expect(telemetry).not.toHaveBeenCalled();
  });

  it('records data authorization block and pauses when gate closes', async () => {
    telemetry.mockRejectedValue(new Error('[DATA_AUTHORIZATION_DENIED] denied'));

    const { rerender } = renderHook(
      ({ blocked }) =>
        useLiveVehicleTelemetry({
          vehicleId: 'veh-1',
          orgId: 'org-1',
          gates: gates({
            dashboardTelemetry: !blocked,
            gpsHighFrequency: !blocked,
          }),
        }),
      { initialProps: { blocked: false } },
    );

    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(useVehicleDetailPollingStore.getState().telemetryAccessBlock).toBe(
      'data_authorization',
    );

    telemetry.mockClear();
    rerender({ blocked: true });
    await vi.advanceTimersByTimeAsync(VEHICLE_DETAIL_POLLING.DASHBOARD_OVERVIEW_MS);
    expect(telemetry).not.toHaveBeenCalled();
  });
});
