// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { renderHook, waitForHook } from '../../test/renderHook';
import { useVehicleLiveMapStore } from '../stores/useVehicleLiveMapStore';
import { useLiveVehicleTelemetry } from './useLiveVehicleTelemetry';

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

const ORG = 'org-1';
const VEH_A = 'veh-a';
const VEH_B = 'veh-b';

function telemetryFixture(overrides: Record<string, unknown> = {}) {
  return {
    latitude: 51.31,
    longitude: 9.48,
    speed: 0,
    fuel: 50,
    coolant: 90,
    battery: 72,
    lvBatteryVoltage: 12.4,
    odometer: 12000,
    engineLoad: 0,
    isIgnitionOn: false,
    lastSignal: '2026-07-24T10:00:00.000Z',
    signalAgeMs: 60_000,
    isFresh: true,
    onlineStatus: 'ONLINE',
    displayState: 'PARKED',
    displayIgnition: 'OFF',
    isLiveTracking: false,
    ...overrides,
  };
}

describe('useLiveVehicleTelemetry — polling lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    useVehicleLiveMapStore.getState().reset();
    vi.mocked(api.vehicles.telemetry).mockResolvedValue(telemetryFixture() as never);
    vi.mocked(api.vehicles.liveGps).mockResolvedValue({
      latitude: 51.32,
      longitude: 9.49,
      speedKmh: 42,
      source: 'dimo',
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    useVehicleLiveMapStore.getState().reset();
  });

  it('binds store and loads dashboard telemetry on mount', async () => {
    const { unmount } = renderHook(() => useLiveVehicleTelemetry(VEH_A, ORG));

    await waitForHook(() => useVehicleLiveMapStore.getState().boundVehicleId === VEH_A);
    expect(api.vehicles.telemetry).toHaveBeenCalledWith(ORG, VEH_A);
    expect(useVehicleLiveMapStore.getState().snapshot?.fuel).toBe(50);
    expect(useVehicleLiveMapStore.getState().loading).toBe(false);

    unmount();
  });

  it('unbinds store when vehicleId becomes null', async () => {
    const { rerender, unmount } = renderHook(
      ({ vehicleId }: { vehicleId: string | null }) =>
        useLiveVehicleTelemetry(vehicleId, ORG),
      { initialProps: { vehicleId: VEH_A } },
    );

    await waitForHook(() => useVehicleLiveMapStore.getState().boundVehicleId === VEH_A);
    rerender({ vehicleId: null });
    expect(useVehicleLiveMapStore.getState().boundVehicleId).toBeNull();

    unmount();
  });

  it('ignores out-of-order dashboard responses after vehicle switch', async () => {
    let resolveFirst!: (value: unknown) => void;
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    vi.mocked(api.vehicles.telemetry)
      .mockReturnValueOnce(first as never)
      .mockResolvedValue(
        telemetryFixture({ latitude: 52, longitude: 10, fuel: 99 }) as never,
      );

    const { rerender, unmount } = renderHook(
      ({ vehicleId }: { vehicleId: string | null }) =>
        useLiveVehicleTelemetry(vehicleId, ORG),
      { initialProps: { vehicleId: VEH_A } },
    );

    rerender({ vehicleId: VEH_B });
    await waitForHook(() => useVehicleLiveMapStore.getState().boundVehicleId === VEH_B);

    resolveFirst(telemetryFixture({ latitude: 40, longitude: 8, fuel: 1 }));
    await waitForHook(() => useVehicleLiveMapStore.getState().snapshot?.fuel === 99);

    expect(useVehicleLiveMapStore.getState().boundVehicleId).toBe(VEH_B);
    expect(useVehicleLiveMapStore.getState().snapshot?.fuel).toBe(99);

    unmount();
  });

  it('keeps previous position when live GPS fetch fails (retry decision: silent)', async () => {
    let liveTracking = false;
    vi.mocked(api.vehicles.telemetry).mockImplementation(async () => {
      const payload = telemetryFixture({ isLiveTracking: liveTracking });
      liveTracking = true;
      return payload as never;
    });
    vi.mocked(api.vehicles.liveGps).mockRejectedValue(new Error('GPS timeout'));

    const { unmount } = renderHook(() => useLiveVehicleTelemetry(VEH_A, ORG));
    await waitForHook(() => useVehicleLiveMapStore.getState().lastConfirmedPosition != null);

    const before = useVehicleLiveMapStore.getState().lastConfirmedPosition;
    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(5_000);
    vi.useRealTimers();

    expect(useVehicleLiveMapStore.getState().lastConfirmedPosition).toEqual(before);
    expect(useVehicleLiveMapStore.getState().error).toBeNull();

    unmount();
  });

  it('surfaces dashboard telemetry errors without clearing bound vehicle', async () => {
    vi.mocked(api.vehicles.telemetry).mockRejectedValue(new Error('Telemetry 503'));

    const { unmount } = renderHook(() => useLiveVehicleTelemetry(VEH_A, ORG));
    await waitForHook(() => useVehicleLiveMapStore.getState().error != null);

    expect(useVehicleLiveMapStore.getState().error).toBe('Telemetry 503');
    expect(useVehicleLiveMapStore.getState().boundVehicleId).toBe(VEH_A);
    expect(useVehicleLiveMapStore.getState().loading).toBe(false);

    unmount();
  });

  it('schedules recurring dashboard polling every 30s', async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useLiveVehicleTelemetry(VEH_A, ORG));
    await vi.runOnlyPendingTimersAsync();

    const initialCalls = api.vehicles.telemetry.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(api.vehicles.telemetry.mock.calls.length).toBeGreaterThan(initialCalls);

    unmount();
  });
});
