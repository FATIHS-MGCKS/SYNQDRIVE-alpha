import { beforeEach, describe, expect, it } from 'vitest';
import { useFleetMapStore } from '../stores/useFleetMapStore';
import {
  applyFleetOperationalOptimisticPatch,
  mapFleetMapVehicleResponse,
} from './fleet-map-vehicle-store.utils';
import {
  VEHICLE_DATA_QUALITY_STATE,
  VEHICLE_OPERATIONAL_STATUS,
} from './vehicle-operational-state';

function seedVehicle() {
  return mapFleetMapVehicleResponse({
    id: 'veh-1',
    licensePlate: 'KS FH 660E',
    displayName: 'Tesla Model 3',
    make: 'Tesla',
    model: 'Model 3',
    year: 2024,
    status: 'Reserved',
    rawVehicleStatus: 'AVAILABLE',
    operationalState: {
      status: 'RESERVED',
      reason: null,
      source: null,
      effectiveFrom: null,
      effectiveUntil: null,
      derivedAt: null,
      dataQualityState: 'RELIABLE',
      dataQualityReasons: [],
      isReliable: true,
    },
    bookingContext: {
      activeBooking: null,
      reservedBooking: {
        bookingId: 'bk-1',
        customerName: 'Max Mustermann',
        pickupAt: '2026-07-10T08:00:00.000Z',
        returnAt: '2026-07-12T08:00:00.000Z',
        pickupStationName: 'Kassel',
        returnStationName: null,
        isOverdue: false,
      },
      nextBooking: null,
      futureBookingCount: 0,
    },
    fuelType: 'Electric',
    healthStatus: 'Good Health',
    cleaningStatus: 'Clean',
    lat: 51.31,
    lng: 9.48,
    odometerKm: 12000,
    fuelPercent: null,
    evSoc: 72,
    isElectric: true,
    reservedBookingId: 'bk-1',
    reservedCustomerName: 'Max Mustermann',
    reservedPickupAt: '2026-07-10T08:00:00.000Z',
    reservedReturnAt: '2026-07-12T08:00:00.000Z',
    reservedPickupStationName: 'Kassel',
    reservedIsOverdue: false,
    activeBookingId: null,
    activeCustomerName: null,
    activeStartAt: null,
    activeReturnAt: null,
    activeReturnStationName: null,
    activeKmIncluded: null,
    activeKmDriven: null,
    activeIsOverdue: false,
    maintenanceReason: null,
    maintenanceReasonCode: null,
    maintenanceUrgency: null,
    stationId: 'st-1',
    stationName: 'Kassel',
    heading: null,
    lastSeenAt: new Date().toISOString(),
    signalAgeMs: 0,
    isFresh: true,
    onlineStatus: 'ONLINE',
    telemetryFreshness: 'live',
    displayState: 'PARKED',
    displayIgnition: 'OFF',
    isLiveTracking: false,
    imageUrl: null,
  });
}

describe('fleet-map-vehicle-store.utils', () => {
  beforeEach(() => {
    useFleetMapStore.setState({
      vehicles: [],
      loading: false,
      error: null,
      lastFetchedAt: null,
    });
  });

  it('applyFleetOperationalOptimisticPatch syncs canonical + legacy flat fields on pickup', () => {
    const vehicle = seedVehicle();
    const patched = applyFleetOperationalOptimisticPatch(vehicle, {
      status: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
      activeBookingId: 'bk-1',
      activeCustomerName: 'Max Mustermann',
      activeReturnAt: '2026-07-12T08:00:00.000Z',
      reservedBookingId: null,
      reservedCustomerName: null,
      reservedPickupAt: null,
      reservedPickupStationName: null,
    });

    expect(patched.operationalState.status).toBe(VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED);
    expect(patched.status).toBe(VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED);
    expect(patched.activeBookingId).toBe('bk-1');
    expect(patched.reservedBookingId).toBeNull();
    expect(patched.bookingContext.activeBooking?.bookingId).toBe('bk-1');
    expect(patched.bookingContext.reservedBooking).toBeNull();
  });

  it('applyFleetOperationalOptimisticPatch clears active rental on return', () => {
    const vehicle = applyFleetOperationalOptimisticPatch(seedVehicle(), {
      status: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
      activeBookingId: 'bk-1',
      activeCustomerName: 'Max',
      activeReturnAt: '2026-07-12T08:00:00.000Z',
      reservedBookingId: null,
    });

    const returned = applyFleetOperationalOptimisticPatch(vehicle, {
      status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
      activeBookingId: null,
      activeCustomerName: null,
      activeReturnAt: null,
      activeReturnStationName: null,
    });

    expect(returned.operationalState.status).toBe(VEHICLE_OPERATIONAL_STATUS.AVAILABLE);
    expect(returned.activeBookingId).toBeNull();
    expect(returned.bookingContext.activeBooking).toBeNull();
  });

  it('marks operational state unreliable when patching to UNKNOWN', () => {
    const patched = applyFleetOperationalOptimisticPatch(seedVehicle(), {
      status: VEHICLE_OPERATIONAL_STATUS.UNKNOWN,
    });
    expect(patched.operationalState.isReliable).toBe(false);
    expect(patched.isReliable).toBe(false);
  });

  it('preserves data quality state on non-unknown patches', () => {
    const vehicle = seedVehicle();
    const patched = applyFleetOperationalOptimisticPatch(vehicle, {
      status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
      reservedBookingId: null,
    });
    expect(patched.operationalState.dataQualityState).toBe(VEHICLE_DATA_QUALITY_STATE.RELIABLE);
  });
});
