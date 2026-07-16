import { describe, expect, it } from 'vitest';
import type { VehicleData } from '../../../data/vehicles';
import type { PickupTileItem, ReturnTileItem } from '../../StatInlineDetail';
import { buildVehicleRuntimeStates } from './vehicleRuntimeStateBuilder';
import {
  classifyTodaysOperational,
  isScheduledToday,
  TODAYS_OPERATIONAL_GROUP_IDS,
} from './todaysOperationalSlice';
import { buildDashboardRuntimeModel } from './dashboardSliceBuilder';
import { resolveTodaysOperationsKpiCounts } from '../dashboardSliceAccess';

const NOW = new Date('2026-06-24T10:00:00.000Z');

function vehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: overrides.id ?? 'v1',
    license: overrides.license ?? 'KS-FS 123',
    make: overrides.make ?? 'VW',
    model: overrides.model ?? 'Golf',
    year: overrides.year ?? 2024,
    station: overrides.station ?? 'Zentrale',
    stationId: overrides.stationId ?? 'st-1',
    fuelType: overrides.fuelType ?? 'Petrol',
    status: overrides.status ?? 'Available',
    cleaningStatus: overrides.cleaningStatus ?? 'Clean',
    healthStatus: overrides.healthStatus ?? 'Good Health',
    online: overrides.online ?? true,
    lastSignal: overrides.lastSignal ?? NOW.toISOString(),
    badge: overrides.badge ?? 0,
    odometer: overrides.odometer ?? 10000,
    fuel: overrides.fuel ?? 72,
    battery: overrides.battery ?? 100,
    speed: overrides.speed ?? 0,
    coolant: overrides.coolant ?? 90,
    brakes: overrides.brakes ?? 90,
    tires: overrides.tires ?? 90,
    engineOil: overrides.engineOil ?? 90,
    isElectric: overrides.isElectric ?? false,
    hvBatteryCapacityKwh: overrides.hvBatteryCapacityKwh ?? null,
    isFresh: overrides.isFresh ?? false,
    onlineStatus: overrides.onlineStatus ?? 'STANDBY',
    leasingRate: overrides.leasingRate ?? '',
    insuranceCost: overrides.insuranceCost ?? '',
    taxCost: overrides.taxCost ?? '',
    totalMonthlyCost: overrides.totalMonthlyCost ?? '',
    ...overrides,
  };
}

function pickup(overrides: Partial<PickupTileItem> = {}): PickupTileItem {
  return {
    time: overrides.time ?? '14:00',
    vehicle: overrides.vehicle ?? 'VW Golf',
    plate: overrides.plate ?? 'KS-FS 123',
    customer: overrides.customer ?? 'Customer',
    station: overrides.station ?? 'Zentrale',
    done: overrides.done ?? false,
    vehicleId: overrides.vehicleId ?? 'v1',
    needsCleaning: overrides.needsCleaning ?? false,
    hasAlert: overrides.hasAlert ?? false,
    hasError: overrides.hasError ?? false,
    bookingId: overrides.bookingId ?? 'b-pickup',
    startDate: overrides.startDate ?? NOW.toISOString(),
    endDate: overrides.endDate ?? NOW.toISOString(),
    isOverdue: overrides.isOverdue ?? false,
    minutesOverdue: overrides.minutesOverdue ?? 0,
    ...overrides,
  };
}

function returnItem(overrides: Partial<ReturnTileItem> = {}): ReturnTileItem {
  return {
    time: overrides.time ?? '18:00',
    vehicle: overrides.vehicle ?? 'VW Golf',
    plate: overrides.plate ?? 'KS-FS 123',
    customer: overrides.customer ?? 'Customer',
    station: overrides.station ?? 'Zentrale',
    done: overrides.done ?? false,
    vehicleId: overrides.vehicleId ?? 'v1',
    hasError: overrides.hasError ?? false,
    kmExceeded: overrides.kmExceeded ?? false,
    extraKm: overrides.extraKm ?? null,
    isOverdue: overrides.isOverdue ?? false,
    returnProtocolStatus: overrides.returnProtocolStatus ?? null,
    hasAlert: overrides.hasAlert ?? false,
    bookingId: overrides.bookingId ?? 'b-return',
    startDate: overrides.startDate ?? NOW.toISOString(),
    endDate: overrides.endDate ?? NOW.toISOString(),
    pickupOdometerKm: overrides.pickupOdometerKm ?? null,
    ...overrides,
  };
}

function classify(
  fleetVehicles: VehicleData[],
  pickupItems: PickupTileItem[] = [],
  returnItems: ReturnTileItem[] = [],
) {
  const vehicleStates = buildVehicleRuntimeStates({ fleetVehicles, now: NOW });
  return classifyTodaysOperational({ vehicleStates, pickupItems, returnItems, now: NOW });
}

describe('todaysOperationalSlice', () => {
  it('excludes a future booking from today operational groups', () => {
    const futureStart = new Date(NOW.getTime() + 14 * 24 * 60 * 60_000).toISOString();
    expect(isScheduledToday(futureStart, NOW)).toBe(false);

    const result = classify(
      [vehicle({ id: 'reserved-future', license: 'FUTURE', status: 'Reserved' })],
      [pickup({ vehicleId: 'reserved-future', plate: 'FUTURE', bookingId: 'future-b', startDate: futureStart })],
    );

    expect(result.pickupsToday).toHaveLength(0);
    expect(result.reservedPickupToday).toHaveLength(0);
    expect(result.overduePickups).toHaveLength(0);
  });

  it('includes pickup today when scheduled on the same calendar day', () => {
    const laterToday = new Date(NOW.getTime() + 4 * 60 * 60_000).toISOString();
    const result = classify(
      [vehicle({ id: 'pickup-1', license: 'PICK-1', status: 'Reserved' })],
      [pickup({ vehicleId: 'pickup-1', plate: 'PICK-1', bookingId: 'pickup-today', startDate: laterToday })],
    );

    expect(result.pickupsToday.map((entry) => entry.item.bookingId)).toEqual(['pickup-today']);
    expect(result.reservedPickupToday.map((entry) => entry.item.bookingId)).toEqual(['pickup-today']);
  });

  it('allows multi-membership for active rented vehicle with return today', () => {
    const result = classify(
      [vehicle({ id: 'rented-1', license: 'RENT-1', status: 'Active Rented' })],
      [],
      [returnItem({ vehicleId: 'rented-1', plate: 'RENT-1', bookingId: 'return-today', endDate: NOW.toISOString() })],
    );

    expect(result.activeRentedNow.map((state) => state.vehicleId)).toEqual(['rented-1']);
    expect(result.returnsToday.map((entry) => entry.item.bookingId)).toEqual(['return-today']);
  });

  it('routes overdue pickup to overdue-pickups only', () => {
    const overdueAt = new Date(NOW.getTime() - 2 * 60 * 60_000).toISOString();
    const result = classify(
      [vehicle({ id: 'pickup-1', license: 'PICK-1', status: 'Reserved' })],
      [pickup({ vehicleId: 'pickup-1', plate: 'PICK-1', bookingId: 'pickup-late', startDate: overdueAt, isOverdue: true, minutesOverdue: 120 })],
    );

    expect(result.pickupsToday).toHaveLength(0);
    expect(result.reservedPickupToday).toHaveLength(0);
    expect(result.overduePickups.map((entry) => entry.item.bookingId)).toEqual(['pickup-late']);
  });

  it('routes overdue return to overdue-returns while keeping active rented', () => {
    const overdueAt = new Date(NOW.getTime() - 30 * 60_000).toISOString();
    const result = classify(
      [vehicle({ id: 'rented-1', license: 'RENT-1', status: 'Active Rented' })],
      [],
      [returnItem({ vehicleId: 'rented-1', plate: 'RENT-1', bookingId: 'return-late', endDate: overdueAt, isOverdue: true })],
    );

    expect(result.activeRentedNow.map((state) => state.vehicleId)).toEqual(['rented-1']);
    expect(result.returnsToday).toHaveLength(0);
    expect(result.overdueReturns.map((entry) => entry.item.bookingId)).toEqual(['return-late']);
  });

  it('does not count UNKNOWN vehicles as active rented now', () => {
    const result = classify([vehicle({ id: 'unknown-1', license: 'UNK-1', status: 'Unknown' })]);
    expect(result.activeRentedNow).toHaveLength(0);
  });

  it('deduplicates the same booking within a single group', () => {
    const duplicatePickup = pickup({ bookingId: 'dup', vehicleId: 'pickup-1', plate: 'PICK-1' });
    const result = classify(
      [vehicle({ id: 'pickup-1', license: 'PICK-1', status: 'Reserved' })],
      [duplicatePickup, { ...duplicatePickup }],
    );
    expect(result.pickupsToday).toHaveLength(1);
  });

  it('builds runtime slice groups from classifier output', () => {
    const runtime = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [
        vehicle({ id: 'rented-1', license: 'RENT-1', status: 'Active Rented' }),
        vehicle({ id: 'pickup-1', license: 'PICK-1', status: 'Reserved' }),
      ],
      pickupItems: [pickup({ vehicleId: 'pickup-1', plate: 'PICK-1', bookingId: 'p1' })],
      returnItems: [returnItem({ vehicleId: 'rented-1', plate: 'RENT-1', bookingId: 'r1' })],
      now: NOW,
    });

    const slice = runtime.slices['active-rented'];
    const groupIds = slice.groups?.map((group) => group.id) ?? [];
    expect(groupIds).toContain(TODAYS_OPERATIONAL_GROUP_IDS.ACTIVE_RENTED_NOW);
    expect(groupIds).toContain(TODAYS_OPERATIONAL_GROUP_IDS.PICKUPS_TODAY);
    expect(groupIds).toContain(TODAYS_OPERATIONAL_GROUP_IDS.RETURNS_TODAY);
    expect(resolveTodaysOperationsKpiCounts(slice)).toEqual({
      activeRentalsCount: 1,
      pickupsToday: 1,
      returnsToday: 1,
      hasOverduePickups: false,
      hasOverdueReturns: false,
    });
    expect(slice.count).toBe(slice.rows.length);
  });
});
