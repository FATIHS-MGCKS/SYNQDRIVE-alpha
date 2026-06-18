import { describe, expect, it } from 'vitest';
import type { VehicleData } from '../../data/vehicles';
import type { VehicleHealthAlert } from '../../DashboardInsightsContext';
import { derivePredictiveOperationsInsights } from './derivePredictiveOperationsInsights';

function vehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: overrides.id ?? 'v1',
    license: overrides.license ?? 'KS-AB 1',
    model: 'Test Car',
    year: 2024,
    station: 'Kassel',
    stationId: 'st-1',
    homeStationId: 'st-1',
    fuelType: 'Petrol',
    status: 'Available',
    cleaningStatus: 'Clean',
    healthStatus: 'Good Health',
    online: true,
    lastSignal: new Date().toISOString(),
    badge: 0,
    odometer: 10000,
    fuel: 80,
    fuelPercent: 80,
    battery: 100,
    speed: 0,
    coolant: 90,
    brakes: 90,
    tires: 90,
    engineOil: 90,
    isElectric: false,
    hvBatteryCapacityKwh: null,
    isFresh: true,
    onlineStatus: 'ONLINE',
    leasingRate: '',
    insuranceCost: '',
    taxCost: '',
    totalMonthlyCost: '',
    ...overrides,
  };
}

const emptyTelemetry = {
  totalInScope: 0,
  freshCount: 0,
  staleCount: 0,
  offlineCount: 0,
  unknownCount: 0,
  hasReliableTimestamps: true,
  syncStatus: 'live' as const,
  lastRefreshLabel: '',
  telemetryUnavailable: false,
};

function baseInput(
  overrides: Partial<Parameters<typeof derivePredictiveOperationsInsights>[0]> = {},
) {
  const v1 = vehicle({ id: 'v1', license: 'KS-AB 1' });
  const fleetById = new Map([[v1.id, v1]]);
  return {
    locale: 'en',
    stationFilter: null,
    vehicles: [v1],
    fleetById,
    stations: [{ id: 'st-1', name: 'Kassel' }],
    pickupItems: [],
    returnItems: [],
    todayPickups: [],
    healthAlerts: [] as VehicleHealthAlert[],
    healthMap: new Map(),
    telemetry: emptyTelemetry,
    readyOptions: { blockedVehicleIds: new Set(), healthRiskVehicleIds: new Set() },
    insights: [],
    fleetLoading: false,
    todayBookingsLoaded: true,
    ...overrides,
  };
}

describe('derivePredictiveOperationsInsights', () => {
  it('does not flag overdue return without follow-up booking', () => {
    const v1 = vehicle({ id: 'v1' });
    const result = derivePredictiveOperationsInsights(
      baseInput({
        vehicles: [v1],
        fleetById: new Map([[v1.id, v1]]),
        returnItems: [
          {
            bookingId: 'bk-ret',
            vehicleId: 'v1',
            isOverdue: true,
            done: false,
            time: '10:00',
            vehicle: 'Test',
            plate: 'KS-AB 1',
            customer: 'A',
            station: 'Kassel',
            hasError: false,
            hasAlert: false,
            startDate: new Date(Date.now() - 3_600_000).toISOString(),
            endDate: new Date(Date.now() - 1_800_000).toISOString(),
          },
        ],
      }),
    );
    expect(result.some((r) => r.type === 'RETURN_OVERDUE_THREATENS_FOLLOWUP')).toBe(false);
  });

  it('flags overdue return when follow-up pickup exists on same vehicle', () => {
    const in2h = new Date(Date.now() + 2 * 3_600_000).toISOString();
    const v1 = vehicle({ id: 'v1' });
    const result = derivePredictiveOperationsInsights(
      baseInput({
        vehicles: [v1],
        fleetById: new Map([[v1.id, v1]]),
        returnItems: [
          {
            bookingId: 'bk-ret',
            vehicleId: 'v1',
            isOverdue: true,
            done: false,
            time: '10:00',
            vehicle: 'Test',
            plate: 'KS-AB 1',
            customer: 'A',
            station: 'Kassel',
            hasError: false,
            hasAlert: false,
            endDate: new Date(Date.now() - 1_800_000).toISOString(),
          },
        ],
        pickupItems: [
          {
            bookingId: 'bk-pu',
            vehicleId: 'v1',
            done: false,
            isOverdue: false,
            time: '12:00',
            vehicle: 'Test',
            plate: 'KS-AB 1',
            customer: 'B',
            station: 'Kassel',
            needsCleaning: false,
            hasAlert: false,
            hasError: false,
            startDate: in2h,
          },
        ],
      }),
    );
    const risk = result.find((r) => r.type === 'RETURN_OVERDUE_THREATENS_FOLLOWUP');
    expect(risk).toBeDefined();
    expect(risk?.confidence).toBe('high');
    expect(risk?.vehicleId).toBe('v1');
  });

  it('flags vehicle not ready before pickup within 24h', () => {
    const in4h = new Date(Date.now() + 4 * 3_600_000).toISOString();
    const v1 = vehicle({ id: 'v1', status: 'Reserved', cleaningStatus: 'Clean' });
    const result = derivePredictiveOperationsInsights(
      baseInput({
        vehicles: [v1],
        fleetById: new Map([[v1.id, v1]]),
        pickupItems: [
          {
            bookingId: 'bk-pu',
            vehicleId: 'v1',
            done: false,
            isOverdue: false,
            time: '16:00',
            vehicle: 'Test',
            plate: 'KS-AB 1',
            customer: 'B',
            station: 'Kassel',
            needsCleaning: true,
            hasAlert: false,
            hasError: false,
            startDate: in4h,
          },
        ],
      }),
    );
    expect(result.some((r) => r.type === 'VEHICLE_NOT_READY_BEFORE_PICKUP')).toBe(true);
  });

  it('flags blocked maintenance vehicle with future booking', () => {
    const in6h = new Date(Date.now() + 6 * 3_600_000).toISOString();
    const v1 = vehicle({
      id: 'v1',
      status: 'Maintenance',
      reservedPickupAt: in6h,
      reservedBookingId: 'bk-res',
    });
    const result = derivePredictiveOperationsInsights(
      baseInput({
        vehicles: [v1],
        fleetById: new Map([[v1.id, v1]]),
      }),
    );
    expect(result.some((r) => r.type === 'BLOCKED_VEHICLE_FUTURE_BOOKING')).toBe(true);
  });

  it('does not flag low fuel when no telemetry values exist', () => {
    const in3h = new Date(Date.now() + 3 * 3_600_000).toISOString();
    const v1 = vehicle({
      id: 'v1',
      fuel: 0,
      fuelPercent: null,
      evSoc: null,
    });
    const result = derivePredictiveOperationsInsights(
      baseInput({
        vehicles: [v1],
        fleetById: new Map([[v1.id, v1]]),
        pickupItems: [
          {
            bookingId: 'bk-pu',
            vehicleId: 'v1',
            done: false,
            isOverdue: false,
            time: '15:00',
            vehicle: 'Test',
            plate: 'KS-AB 1',
            customer: 'B',
            station: 'Kassel',
            needsCleaning: false,
            hasAlert: false,
            hasError: false,
            startDate: in3h,
          },
        ],
      }),
    );
    expect(result.some((r) => r.type === 'LOW_ENERGY_BEFORE_PICKUP')).toBe(false);
  });

  it('respects station filter for station shortage', () => {
    const in5h = new Date(Date.now() + 5 * 3_600_000).toISOString();
    const vBerlin = vehicle({ id: 'v-b', stationId: 'st-2', homeStationId: 'st-2', license: 'B-XY 1' });
    const result = derivePredictiveOperationsInsights(
      baseInput({
        stationFilter: 'st-1',
        vehicles: [vBerlin],
        fleetById: new Map([[vBerlin.id, vBerlin]]),
        stations: [
          { id: 'st-1', name: 'Kassel' },
          { id: 'st-2', name: 'Berlin' },
        ],
        todayPickups: [
          {
            id: 'bk-berlin',
            pickupStationId: 'st-2',
            startDate: in5h,
          },
        ],
      }),
    );
    expect(result.some((r) => r.type === 'STATION_SHORTAGE_24H')).toBe(false);
  });

  it('detects station shortage when demand exceeds ready vehicles', () => {
    const in5h = new Date(Date.now() + 5 * 3_600_000).toISOString();
    const dirty = vehicle({
      id: 'v1',
      cleaningStatus: 'Needs Cleaning',
      status: 'Available',
    });
    const result = derivePredictiveOperationsInsights(
      baseInput({
        vehicles: [dirty],
        fleetById: new Map([[dirty.id, dirty]]),
        todayPickups: [
          { id: 'bk-1', pickupStationId: 'st-1', startDate: in5h },
          { id: 'bk-2', pickupStationId: 'st-1', startDate: in5h },
        ],
      }),
    );
    const shortage = result.find((r) => r.type === 'STATION_SHORTAGE_24H');
    expect(shortage).toBeDefined();
    expect(shortage?.affectedEntity).toEqual(
      expect.objectContaining({ kind: 'station', stationId: 'st-1' }),
    );
  });
});
