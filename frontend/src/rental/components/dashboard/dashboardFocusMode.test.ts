import { describe, expect, it, vi, afterEach } from 'vitest';
import type { VehicleData } from '../../data/vehicles';
import {
  getDuePickups,
  getFocusNotReadyVehicles,
  getFocusNotReadyVehiclesFromRuntime,
  getOverdueReturns,
  persistOperatorFocusModePreference,
  readOperatorFocusModePreference,
  shouldShowDataFreshnessWarning,
} from './dashboardFocusMode';
import { OPERATOR_FOCUS_MODE_STORAGE_KEY } from './dashboardTypes';
import type { VehicleRuntimeState } from './runtime';

function vehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: overrides.id ?? 'v1',
    license: 'KS-AB 1',
    model: 'Car',
    year: 2024,
    station: 'Kassel',
    fuelType: 'Petrol',
    status: 'Available',
    cleaningStatus: 'Clean',
    healthStatus: 'Good Health',
    online: true,
    lastSignal: new Date().toISOString(),
    badge: 0,
    odometer: 0,
    fuel: 80,
    battery: 100,
    speed: 0,
    coolant: 90,
    brakes: 90,
    tires: 90,
    engineOil: 90,
    isElectric: false,
    hvBatteryCapacityKwh: null,
    leasingRate: '',
    insuranceCost: '',
    taxCost: '',
    totalMonthlyCost: '',
    ...overrides,
  };
}

function runtimeState(overrides: Partial<VehicleRuntimeState> = {}): VehicleRuntimeState {
  return {
    vehicleId: overrides.vehicleId ?? 'v1',
    license: overrides.license ?? 'KS-AB 1',
    displayName: overrides.displayName ?? 'Car',
    stationId: null,
    stationLabel: null,
    operationalStatus: 'available',
    rentalReadiness: 'ready',
    blockLevel: 'none',
    healthSeverity: 'ok',
    complianceSeverity: 'ok',
    telemetryState: 'standby',
    dataQualityState: 'fresh',
    bookingState: 'none',
    readyReasons: [],
    notReadyReasons: [],
    blockReasons: [],
    warningReasons: [],
    criticalReasons: [],
    isAvailable: true,
    isReadyToRent: true,
    isBlocked: false,
    isMaintenance: false,
    isCritical: false,
    isWarning: false,
    ...overrides,
  };
}

describe('dashboardFocusMode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists focus mode preference in localStorage', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });

    persistOperatorFocusModePreference(true);
    expect(localStorage.getItem(OPERATOR_FOCUS_MODE_STORAGE_KEY)).toBe('1');
    expect(readOperatorFocusModePreference()).toBe(true);
    persistOperatorFocusModePreference(false);
    expect(readOperatorFocusModePreference()).toBe(false);
  });

  it('lists not-ready vehicles excluding active rented', () => {
    const items = getFocusNotReadyVehicles(
      [
        vehicle({ id: 'ready', status: 'Available' }),
        vehicle({ id: 'dirty', cleaningStatus: 'Needs Cleaning' }),
        vehicle({ id: 'rented', status: 'Active Rented' }),
      ],
      { blockedVehicleIds: new Set(), healthRiskVehicleIds: new Set() },
      'en',
    );
    expect(items.map((i) => i.vehicleId)).toEqual(['dirty']);
  });

  it('lists not-ready vehicles from runtime states for the active dashboard path', () => {
    const items = getFocusNotReadyVehiclesFromRuntime(
      [
        runtimeState({ vehicleId: 'ready', isReadyToRent: true }),
        runtimeState({
          vehicleId: 'dirty',
          isReadyToRent: false,
          rentalReadiness: 'not_ready',
          notReadyReasons: [
            {
              id: 'cleaning',
              category: 'cleaning',
              severity: 'warning',
              title: 'Cleaning pending',
            },
          ],
        }),
        runtimeState({ vehicleId: 'rented', operationalStatus: 'active_rented', isReadyToRent: false }),
      ],
      'en',
    );
    expect(items.map((i) => i.vehicleId)).toEqual(['dirty']);
    expect(items[0]?.reason).toBe('Cleaning pending');
  });

  it('filters overdue returns and due pickups', () => {
    const overdue = getOverdueReturns([
      {
        bookingId: 'r1',
        done: false,
        isOverdue: true,
        time: '10:00',
        vehicle: 'A',
        plate: 'A',
        customer: 'X',
        station: 'S',
        hasError: false,
        hasAlert: false,
      },
    ]);
    expect(overdue).toHaveLength(1);

    const in30m = new Date(Date.now() + 30 * 60_000).toISOString();
    const due = getDuePickups([
      {
        bookingId: 'p1',
        done: false,
        isOverdue: false,
        time: '12:00',
        vehicle: 'B',
        plate: 'B',
        customer: 'Y',
        station: 'S',
        needsCleaning: false,
        hasAlert: false,
        hasError: false,
        startDate: in30m,
      },
    ]);
    expect(due).toHaveLength(1);
  });

  it('detects data freshness warnings', () => {
    expect(
      shouldShowDataFreshnessWarning({
        syncStatus: 'live',
        telemetry: {
          totalInScope: 5,
          liveCount: 1,
          standbyCount: 4,
          softOfflineCount: 0,
          freshCount: 5,
          staleCount: 0,
          offlineCount: 0,
          unknownCount: 0,
          hasReliableTimestamps: true,
          syncStatus: 'live',
          lastRefreshLabel: '',
          telemetryUnavailable: false,
        },
        dataFreshness: {
          fleetLoading: false,
          fleetCountdownSec: 0,
          insightsLoading: false,
          insightsStale: false,
          insightsGeneratedAt: null,
          insightsError: false,
          todayBookingsLoaded: true,
          todayBookingsError: false,
          invoicesLoaded: true,
          invoicesError: false,
        },
      }),
    ).toBe(false);

    expect(
      shouldShowDataFreshnessWarning({
        syncStatus: 'stale',
        telemetry: {
          totalInScope: 5,
          liveCount: 1,
          standbyCount: 0,
          softOfflineCount: 4,
          freshCount: 1,
          staleCount: 4,
          offlineCount: 0,
          unknownCount: 0,
          hasReliableTimestamps: true,
          syncStatus: 'stale',
          lastRefreshLabel: '',
          telemetryUnavailable: false,
        },
        dataFreshness: {
          fleetLoading: false,
          fleetCountdownSec: 0,
          insightsLoading: false,
          insightsStale: true,
          insightsGeneratedAt: null,
          insightsError: false,
          todayBookingsLoaded: true,
          todayBookingsError: false,
          invoicesLoaded: true,
          invoicesError: false,
        },
      }),
    ).toBe(true);
  });
});
