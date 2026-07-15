import { describe, expect, it } from 'vitest';
import type { VehicleData } from '../data/vehicles';
import {
  applyFleetCommandFilters,
  computeCommandTabCounts,
  filterFleetByTab,
  resolveFleetCommandTabForVehicle,
  selectHasFutureBooking,
  vehicleMatchesFleetCommandTab,
  type FleetCommandTab,
} from './fleet-command-filters';
import { buildFleetVehicleContexts } from './fleet-operator-panel';
import {
  VEHICLE_DATA_QUALITY_STATE,
  VEHICLE_OPERATIONAL_STATUS,
} from './vehicle-operational-state';

function vehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  const status = overrides.status ?? VEHICLE_OPERATIONAL_STATUS.AVAILABLE;
  return {
    id: overrides.id ?? 'v1',
    license: overrides.license ?? 'KS-FS 123',
    make: 'VW',
    model: 'Touran 2024',
    year: 2024,
    station: 'Kassel',
    stationId: 'st-1',
    stationName: 'Kassel Station',
    fuelType: 'Petrol',
    status,
    operationalState: {
      status,
      reason: null,
      source: null,
      effectiveFrom: null,
      effectiveUntil: null,
      derivedAt: null,
      dataQualityState: VEHICLE_DATA_QUALITY_STATE.RELIABLE,
      dataQualityReasons: [],
      isReliable: true,
      ...overrides.operationalState,
    },
    bookingContext: {
      activeBooking: null,
      reservedBooking: null,
      nextBooking: null,
      futureBookingCount: 0,
      ...overrides.bookingContext,
    },
    cleaningStatus: 'Clean',
    healthStatus: 'Good Health',
    online: true,
    lastSignal: new Date().toISOString(),
    badge: 0,
    odometer: 10000,
    fuel: 72,
    battery: 100,
    speed: 0,
    coolant: 90,
    brakes: 90,
    tires: 90,
    engineOil: 90,
    isElectric: false,
    hvBatteryCapacityKwh: null,
    lat: 51.31,
    lng: 9.48,
    fuelPercent: 72,
    isFresh: true,
    onlineStatus: 'ONLINE',
    leasingRate: '',
    insuranceCost: '',
    taxCost: '',
    totalMonthlyCost: '',
    ...overrides,
  } as VehicleData;
}

function contextsFor(vehicles: VehicleData[]) {
  return buildFleetVehicleContexts(vehicles, () => null);
}

describe('fleet-command-filters', () => {
  const futurePickup = new Date(Date.now() + 14 * 24 * 60 * 60_000).toISOString();
  const todayPickup = new Date().toISOString();

  const fleet = [
    vehicle({ id: 'avail', license: 'AVL' }),
    vehicle({
      id: 'future',
      license: 'FUT',
      bookingContext: {
        activeBooking: null,
        reservedBooking: null,
        nextBooking: {
          bookingId: 'bk-future',
          customerName: 'Future',
          pickupAt: futurePickup,
          returnAt: null,
          pickupStationName: null,
          returnStationName: null,
          isOverdue: false,
        },
        futureBookingCount: 1,
      },
    }),
    vehicle({
      id: 'reserved',
      license: 'RES',
      status: VEHICLE_OPERATIONAL_STATUS.RESERVED,
      operationalState: {
        status: VEHICLE_OPERATIONAL_STATUS.RESERVED,
        reason: null,
        source: null,
        effectiveFrom: null,
        effectiveUntil: null,
        derivedAt: null,
        dataQualityState: VEHICLE_DATA_QUALITY_STATE.RELIABLE,
        dataQualityReasons: [],
        isReliable: true,
      },
      bookingContext: {
        activeBooking: null,
        reservedBooking: {
          bookingId: 'bk-res',
          customerName: 'Pickup Today',
          pickupAt: todayPickup,
          returnAt: null,
          pickupStationName: null,
          returnStationName: null,
          isOverdue: false,
        },
        nextBooking: null,
        futureBookingCount: 0,
      },
    }),
    vehicle({
      id: 'rented',
      license: 'ACT',
      status: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
      operationalState: {
        status: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
        reason: null,
        source: null,
        effectiveFrom: null,
        effectiveUntil: null,
        derivedAt: null,
        dataQualityState: VEHICLE_DATA_QUALITY_STATE.RELIABLE,
        dataQualityReasons: [],
        isReliable: true,
      },
      bookingContext: {
        activeBooking: {
          bookingId: 'bk-act',
          customerName: 'Renter',
          pickupAt: todayPickup,
          returnAt: todayPickup,
          pickupStationName: null,
          returnStationName: null,
          isOverdue: false,
        },
        reservedBooking: null,
        nextBooking: null,
        futureBookingCount: 0,
      },
    }),
    vehicle({
      id: 'unknown',
      license: 'UNK',
      status: VEHICLE_OPERATIONAL_STATUS.UNKNOWN,
      operationalState: {
        status: VEHICLE_OPERATIONAL_STATUS.UNKNOWN,
        reason: 'conflict',
        source: 'test',
        effectiveFrom: null,
        effectiveUntil: null,
        derivedAt: null,
        dataQualityState: VEHICLE_DATA_QUALITY_STATE.DEGRADED,
        dataQualityReasons: [],
        isReliable: false,
      },
    }),
    vehicle({
      id: 'maint',
      license: 'MNT',
      status: VEHICLE_OPERATIONAL_STATUS.MAINTENANCE,
      operationalState: {
        status: VEHICLE_OPERATIONAL_STATUS.MAINTENANCE,
        reason: null,
        source: null,
        effectiveFrom: null,
        effectiveUntil: null,
        derivedAt: null,
        dataQualityState: VEHICLE_DATA_QUALITY_STATE.RELIABLE,
        dataQualityReasons: [],
        isReliable: true,
      },
    }),
  ];

  const contexts = contextsFor(fleet);

  it('places booking in two weeks in Available tab, not Reserved', () => {
    const future = fleet.find((v) => v.id === 'future')!;
    expect(resolveFleetCommandTabForVehicle(future)).toBe('Available');
    expect(vehicleMatchesFleetCommandTab(future, 'Available')).toBe(true);
    expect(vehicleMatchesFleetCommandTab(future, 'Reserved')).toBe(false);
    expect(selectHasFutureBooking(future)).toBe(true);
  });

  it('places pickup-today reservation in Reserved tab', () => {
    const reserved = fleet.find((v) => v.id === 'reserved')!;
    expect(resolveFleetCommandTabForVehicle(reserved)).toBe('Reserved');
    expect(filterFleetByTab(contexts, 'Reserved').map((c) => c.vehicle.id)).toEqual(['reserved']);
  });

  it('places active rental in Active tab', () => {
    const rented = fleet.find((v) => v.id === 'rented')!;
    expect(resolveFleetCommandTabForVehicle(rented)).toBe('Active');
    expect(filterFleetByTab(contexts, 'Active').map((c) => c.vehicle.id)).toEqual(['rented']);
  });

  it('never places UNKNOWN in Available tab', () => {
    const unknown = fleet.find((v) => v.id === 'unknown')!;
    expect(resolveFleetCommandTabForVehicle(unknown)).toBe('Unknown');
    expect(vehicleMatchesFleetCommandTab(unknown, 'Available')).toBe(false);
    expect(vehicleMatchesFleetCommandTab(unknown, 'Unknown')).toBe(true);
  });

  it('tab counts match list filters for the same selector base', () => {
    const counts = computeCommandTabCounts(contexts);
    expect(counts.All).toBe(fleet.length);
    for (const tab of ['Available', 'Reserved', 'Active', 'Maintenance', 'Unknown'] as const) {
      expect(filterFleetByTab(contexts, tab)).toHaveLength(counts[tab]);
    }
  });

  it('combines search scope with tab and future-booking overlay', () => {
    const scoped = contexts.filter((c) => c.vehicle.license.includes('F'));
    const filtered = applyFleetCommandFilters(scoped, {
      tab: 'Available',
      futureBookingOnly: true,
    });
    expect(filtered.map((c) => c.vehicle.id)).toEqual(['future']);
  });

  it('future-booking overlay does not change operational tab assignment', () => {
    const counts = computeCommandTabCounts(contexts, { futureBookingOnly: true });
    expect(counts.Available).toBe(1);
    expect(counts.All).toBe(1);
  });

  it('does not assign Reserved tab from reservedBookingId without RESERVED status', () => {
    const legacy = vehicle({
      id: 'legacy',
      status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
      reservedBookingId: 'legacy-bk',
      reservedPickupAt: futurePickup,
    });
    expect(resolveFleetCommandTabForVehicle(legacy)).not.toBe('Reserved');
  });
});
