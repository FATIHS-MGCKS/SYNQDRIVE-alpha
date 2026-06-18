import { describe, expect, it, vi, afterEach } from 'vitest';
import type { VehicleData } from '../../data/vehicles';
import {
  getDuePickups,
  getFocusNotReadyVehicles,
  getOverdueReturns,
  persistOperatorFocusModePreference,
  readOperatorFocusModePreference,
  shouldShowDataFreshnessWarning,
} from './dashboardFocusMode';
import { OPERATOR_FOCUS_MODE_STORAGE_KEY } from './dashboardTypes';

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
