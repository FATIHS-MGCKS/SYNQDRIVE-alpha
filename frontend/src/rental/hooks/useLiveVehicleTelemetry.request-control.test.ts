// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '../../test/renderHook';
import { ApiHttpError } from '../../lib/api';
import { api } from '../../lib/api';
import { useLiveVehicleTelemetry } from './useLiveVehicleTelemetry';
import {
  resolveVehicleDetailPollingGates,
  VEHICLE_DETAIL_POLLING,
} from '../lib/vehicle-detail-polling-policy';
import { useVehicleLiveMapStore } from '../stores/useVehicleLiveMapStore';
import { useVehicleDetailPollingStore } from '../stores/useVehicleDetailPollingStore';
import { VEHICLE_TELEMETRY_RETRY } from '../lib/vehicle-telemetry-retry';

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

const dashboardOk = {
  latitude: 51.1,
  longitude: 9.4,
  isLiveTracking: true,
  lastSignal: new Date().toISOString(),
  onlineStatus: 'ONLINE',
  displayState: 'MOVING',
  displayIgnition: 'ON',
} as const;

const gpsOk = {
  latitude: 51.11,
  longitude: 9.41,
  speedKmh: 12,
  source: 'dimo' as const,
  measuredAt: new Date().toISOString(),
  receivedAt: new Date().toISOString(),
  lastSeenAt: new Date().toISOString(),
};

describe('useLiveVehicleTelemetry request control', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    useVehicleLiveMapStore.getState().reset();
    useVehicleDetailPollingStore.getState().reset();
    telemetry.mockResolvedValue(dashboardOk as never);
    liveGps.mockResolvedValue(gpsOk as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ignores delayed responses after vehicle change', async () => {
    let resolveSlow!: (value: typeof dashboardOk) => void;
    telemetry.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSlow = resolve;
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
      ...dashboardOk,
      latitude: 99,
      longitude: 99,
    } as never);

    resolveSlow(dashboardOk);
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();

    const store = useVehicleLiveMapStore.getState();
    expect(store.boundVehicleId).toBe('veh-2');
    expect(store.snapshot?.speed).not.toBe(99);
  });

  it('aborts in-flight dashboard request on tab gate close', async () => {
    let capturedSignal: AbortSignal | undefined;
    telemetry.mockImplementation((_org, _id, init) => {
      capturedSignal = init?.signal ?? undefined;
      return new Promise(() => undefined) as never;
    });

    const { rerender } = renderHook(
      ({ g }) =>
        useLiveVehicleTelemetry({
          vehicleId: 'veh-1',
          orgId: 'org-1',
          gates: g,
        }),
      { initialProps: { g: gates() } },
    );

    await Promise.resolve();
    expect(capturedSignal).toBeDefined();

    rerender({ g: gates({ dashboardTelemetry: false, gpsHighFrequency: false }) });
    await Promise.resolve();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('surfaces user-friendly errors without technical API text', async () => {
    telemetry.mockRejectedValue(new ApiHttpError('Internal Server Error', 500));

    renderHook(() =>
      useLiveVehicleTelemetry({
        vehicleId: 'veh-1',
        orgId: 'org-1',
        gates: gates(),
      }),
    );

    await vi.runOnlyPendingTimersAsync();
    await vi.advanceTimersByTimeAsync(VEHICLE_DETAIL_POLLING.DASHBOARD_OVERVIEW_MS);
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();

    const error = useVehicleLiveMapStore.getState().error;
    expect(error).toMatch(/vorübergehend/);
    expect(error).not.toMatch(/Internal Server Error/);
  });

  it('sets access block on data authorization and pauses when gates close', async () => {
    telemetry.mockRejectedValue(
      new ApiHttpError('[DATA_AUTHORIZATION_DENIED] denied', 403),
    );

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
    await Promise.resolve();
    expect(useVehicleDetailPollingStore.getState().telemetryAccessBlock).toBe(
      'data_authorization',
    );

    telemetry.mockClear();
    rerender({
      g: gates({
        accessBlockReason: 'data_authorization',
        dashboardTelemetry: false,
        gpsHighFrequency: false,
      }),
    });
    await vi.advanceTimersByTimeAsync(VEHICLE_DETAIL_POLLING.DASHBOARD_OVERVIEW_MS * 3);
    await Promise.resolve();
    expect(telemetry).not.toHaveBeenCalled();
  });

  it('uses backoff delay after 429 with Retry-After', async () => {
    telemetry
      .mockRejectedValueOnce(new ApiHttpError('Too many', 429, 12_000))
      .mockResolvedValueOnce(dashboardOk as never);

    renderHook(() =>
      useLiveVehicleTelemetry({
        vehicleId: 'veh-1',
        orgId: 'org-1',
        gates: gates(),
      }),
    );

    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    telemetry.mockClear();

    await vi.advanceTimersByTimeAsync(11_999);
    await Promise.resolve();
    expect(telemetry).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2);
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(telemetry).toHaveBeenCalled();
  });

  it('stops polling after unmount', async () => {
    const { unmount } = renderHook(() =>
      useLiveVehicleTelemetry({
        vehicleId: 'veh-1',
        orgId: 'org-1',
        gates: gates(),
      }),
    );

    await vi.runOnlyPendingTimersAsync();
    telemetry.mockClear();
    liveGps.mockClear();
    unmount();

    await vi.advanceTimersByTimeAsync(VEHICLE_DETAIL_POLLING.GPS_MS * 3);
    await Promise.resolve();
    expect(telemetry).not.toHaveBeenCalled();
    expect(liveGps).not.toHaveBeenCalled();
  });

  it('passes AbortSignal to API calls', async () => {
    let seenSignal: AbortSignal | undefined;
    telemetry.mockImplementation((_org, _id, init) => {
      seenSignal = init?.signal;
      return Promise.resolve(dashboardOk as never);
    });

    renderHook(() =>
      useLiveVehicleTelemetry({
        vehicleId: 'veh-1',
        orgId: 'org-1',
        gates: gates(),
      }),
    );

    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(seenSignal).toBeDefined();
    expect(seenSignal?.aborted).toBe(false);
  });

  it('recovers after offline failure without surfacing on first transient error', async () => {
    telemetry
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(dashboardOk as never);

    renderHook(() =>
      useLiveVehicleTelemetry({
        vehicleId: 'veh-1',
        orgId: 'org-1',
        gates: gates(),
      }),
    );

    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(useVehicleLiveMapStore.getState().error).toBeNull();

    await vi.advanceTimersByTimeAsync(VEHICLE_TELEMETRY_RETRY.BASE_MS);
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();

    expect(useVehicleLiveMapStore.getState().error).toBeNull();
    expect(useVehicleLiveMapStore.getState().loading).toBe(false);
  });
});
