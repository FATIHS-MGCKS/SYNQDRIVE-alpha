import { describe, expect, it } from 'vitest';
import type { FleetMapVehicleResponse } from '../../lib/api';
import {
  flattenBookingContextToLegacy,
  mapFleetMapVehicleResponse,
} from './fleet-map-vehicle-mapper';
import {
  selectFleetActiveReturnAt,
  selectFleetActiveStartAt,
  selectFleetFutureBookingCount,
  selectFleetNextBooking,
  selectFleetOperationalStatus,
  selectFleetRawVehicleStatus,
  selectFleetReservedReturnAt,
} from './fleet-map-vehicle-selectors';
import {
  VEHICLE_DATA_QUALITY_STATE,
  VEHICLE_OPERATIONAL_STATUS,
} from './vehicle-operational-state';

const BASE_ROW: FleetMapVehicleResponse = {
  id: 'veh-1',
  licensePlate: 'M-AB 123',
  displayName: 'VW Golf',
  make: 'VW',
  model: 'Golf',
  year: 2024,
  status: 'Available',
  fuelType: 'Petrol',
  healthStatus: 'Good Health',
  cleaningStatus: 'Clean',
  stationId: 'st-1',
  stationName: 'Berlin',
  homeStationId: 'st-1',
  currentStationId: 'st-1',
  expectedStationId: null,
  latitude: 52.5,
  longitude: 13.4,
  lastSeenAt: '2026-07-15T10:00:00.000Z',
  signalAgeMs: 1000,
  isFresh: true,
  onlineStatus: 'ONLINE',
  displayState: 'PARKED',
  displayIgnition: 'OFF',
  isLiveTracking: false,
  heading: null,
  imageUrl: null,
  odometerKm: 12000,
  fuelPercent: 80,
  evSoc: null,
  isElectric: false,
  reservedBookingId: null,
  reservedCustomerName: null,
  reservedPickupAt: null,
  reservedReturnAt: null,
  reservedPickupStationName: null,
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
};

describe('mapFleetMapVehicleResponse', () => {
  it('maps a full canonical DTO without losing fields', () => {
    const raw: FleetMapVehicleResponse = {
      ...BASE_ROW,
      rawVehicleStatus: 'RENTED',
      status: 'Active Rented',
      operationalState: {
        status: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
        reason: 'ACTIVE_BOOKING',
        source: 'fleet-read-model',
        effectiveFrom: '2026-07-14T08:00:00.000Z',
        effectiveUntil: null,
        derivedAt: '2026-07-15T10:00:00.000Z',
        dataQualityState: VEHICLE_DATA_QUALITY_STATE.RELIABLE,
        dataQualityReasons: [],
        isReliable: true,
      },
      bookingContext: {
        activeBooking: {
          bookingId: 'bk-active',
          customerName: 'Anna',
          pickupAt: '2026-07-14T08:00:00.000Z',
          returnAt: '2026-07-20T18:00:00.000Z',
          pickupStationName: 'Berlin',
          returnStationName: 'Munich',
          isOverdue: false,
        },
        reservedBooking: null,
        nextBooking: {
          bookingId: 'bk-next',
          customerName: 'Tom',
          pickupAt: '2026-07-22T09:00:00.000Z',
          returnAt: '2026-07-25T09:00:00.000Z',
          pickupStationName: 'Hamburg',
          returnStationName: 'Hamburg',
          isOverdue: false,
        },
        futureBookingCount: 2,
      },
      activeBookingId: 'bk-active',
      activeCustomerName: 'Anna',
      activeStartAt: '2026-07-14T08:00:00.000Z',
      activeReturnAt: '2026-07-20T18:00:00.000Z',
      activeReturnStationName: 'Munich',
      activeKmIncluded: 500,
      activeKmDriven: 120,
    };

    const mapped = mapFleetMapVehicleResponse(raw);

    expect(mapped.status).toBe(VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED);
    expect(mapped.rawVehicleStatus).toBe('RENTED');
    expect(mapped.operationalState.source).toBe('fleet-read-model');
    expect(mapped.operationalState.reason).toBe('ACTIVE_BOOKING');
    expect(mapped.bookingContext.activeBooking?.bookingId).toBe('bk-active');
    expect(mapped.bookingContext.nextBooking?.bookingId).toBe('bk-next');
    expect(mapped.bookingContext.futureBookingCount).toBe(2);
    expect(mapped.activeStartAt).toBe('2026-07-14T08:00:00.000Z');
    expect(mapped.activeReturnAt).toBe('2026-07-20T18:00:00.000Z');
    expect(mapped.activeKmIncluded).toBe(500);
    expect(mapped.activeKmDriven).toBe(120);
    expect(selectFleetOperationalStatus(mapped)).toBe(VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED);
    expect(selectFleetRawVehicleStatus(mapped)).toBe('RENTED');
    expect(selectFleetNextBooking(mapped)?.bookingId).toBe('bk-next');
    expect(selectFleetFutureBookingCount(mapped)).toBe(2);
  });

  it('maps a legacy flat response via normalization only', () => {
    const raw: FleetMapVehicleResponse = {
      ...BASE_ROW,
      status: 'Reserved',
      reservedBookingId: 'bk-res',
      reservedCustomerName: 'Max',
      reservedPickupAt: '2026-07-16T10:00:00.000Z',
      reservedReturnAt: '2026-07-18T10:00:00.000Z',
      reservedPickupStationName: 'Berlin',
      reservedIsOverdue: true,
    };

    const mapped = mapFleetMapVehicleResponse(raw);

    expect(mapped.status).toBe(VEHICLE_OPERATIONAL_STATUS.RESERVED);
    expect(mapped.rawVehicleStatus).toBe('Reserved');
    expect(mapped.bookingContext.reservedBooking?.bookingId).toBe('bk-res');
    expect(mapped.reservedReturnAt).toBe('2026-07-18T10:00:00.000Z');
    expect(mapped.reservedPickupAt).toBe('2026-07-16T10:00:00.000Z');
    expect(selectFleetReservedReturnAt(mapped)).toBe('2026-07-18T10:00:00.000Z');
    expect(mapped.bookingContext.nextBooking).toBeNull();
    expect(mapped.bookingContext.futureBookingCount).toBe(0);
  });

  it('supports UNKNOWN without coercing to AVAILABLE', () => {
    const raw: FleetMapVehicleResponse = {
      ...BASE_ROW,
      status: 'Unknown',
      operationalState: {
        status: VEHICLE_OPERATIONAL_STATUS.UNKNOWN,
        reason: 'DATA_UNAVAILABLE',
        source: 'fleet-read-model',
        effectiveFrom: null,
        effectiveUntil: null,
        derivedAt: '2026-07-15T10:00:00.000Z',
        dataQualityState: VEHICLE_DATA_QUALITY_STATE.UNAVAILABLE,
        dataQualityReasons: ['STALE_BOOKING_TRUTH'],
        isReliable: false,
      },
      dataQualityState: VEHICLE_DATA_QUALITY_STATE.UNAVAILABLE,
      isReliable: false,
    };

    const mapped = mapFleetMapVehicleResponse(raw);

    expect(mapped.status).toBe(VEHICLE_OPERATIONAL_STATUS.UNKNOWN);
    expect(mapped.operationalState.isReliable).toBe(false);
    expect(mapped.dataQualityReasons).toContain('STALE_BOOKING_TRUTH');
    expect(mapped.isReliable).toBe(false);
  });

  it('handles missing optional nextBooking on canonical bookingContext', () => {
    const raw: FleetMapVehicleResponse = {
      ...BASE_ROW,
      status: 'Active Rented',
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
          bookingId: 'bk-1',
          customerName: 'Lisa',
          pickupAt: '2026-07-10T08:00:00.000Z',
          returnAt: '2026-07-12T08:00:00.000Z',
          pickupStationName: null,
          returnStationName: null,
          isOverdue: false,
        },
        reservedBooking: null,
        nextBooking: null,
        futureBookingCount: 0,
      },
    };

    const mapped = mapFleetMapVehicleResponse(raw);

    expect(mapped.bookingContext.nextBooking).toBeNull();
    expect(selectFleetNextBooking(mapped)).toBeNull();
    expect(selectFleetActiveStartAt(mapped)).toBe('2026-07-10T08:00:00.000Z');
    expect(selectFleetActiveReturnAt(mapped)).toBe('2026-07-12T08:00:00.000Z');
  });

  it('preserves null telemetry legacy fields without coercing to zero', () => {
    const raw: FleetMapVehicleResponse = {
      ...BASE_ROW,
      odometerKm: null,
      fuelPercent: null,
      evSoc: null,
    };

    const mapped = mapFleetMapVehicleResponse(raw);

    expect(mapped.odometer).toBeNull();
    expect(mapped.fuel).toBeNull();
    expect(mapped.battery).toBeNull();
    expect(mapped.speed).toBeNull();
    expect(mapped.coolant).toBeNull();
    expect(mapped.odometerKm).toBeNull();
    expect(mapped.fuelPercent).toBeNull();
    expect(mapped.evSoc).toBeNull();
  });

  it('does not derive RESERVED from futureBookingCount alone', () => {
    const raw: FleetMapVehicleResponse = {
      ...BASE_ROW,
      status: 'Available',
      bookingContext: {
        activeBooking: null,
        reservedBooking: null,
        nextBooking: {
          bookingId: 'bk-future',
          customerName: 'Future',
          pickupAt: '2026-08-01T10:00:00.000Z',
          returnAt: '2026-08-05T10:00:00.000Z',
          pickupStationName: null,
          returnStationName: null,
          isOverdue: false,
        },
        futureBookingCount: 3,
      },
    };

    const mapped = mapFleetMapVehicleResponse(raw);

    expect(mapped.status).toBe(VEHICLE_OPERATIONAL_STATUS.AVAILABLE);
    expect(mapped.bookingContext.reservedBooking).toBeNull();
    expect(mapped.bookingContext.futureBookingCount).toBe(3);
    expect(selectFleetNextBooking(mapped)?.bookingId).toBe('bk-future');
  });

  it('preserves reservedReturnAt and activeStartAt through flatten projection', () => {
    const bookingContext = {
      activeBooking: {
        bookingId: 'bk-a',
        customerName: 'A',
        pickupAt: '2026-07-01T08:00:00.000Z',
        returnAt: '2026-07-03T08:00:00.000Z',
        pickupStationName: null,
        returnStationName: 'Cologne',
        isOverdue: false,
      },
      reservedBooking: {
        bookingId: 'bk-r',
        customerName: 'R',
        pickupAt: '2026-07-05T10:00:00.000Z',
        returnAt: '2026-07-07T10:00:00.000Z',
        pickupStationName: 'Berlin',
        returnStationName: null,
        isOverdue: false,
      },
      nextBooking: null,
      futureBookingCount: 1,
    };

    const flat = flattenBookingContextToLegacy(bookingContext, {
      activeKmIncluded: 300,
      activeKmDriven: 45,
    });

    expect(flat.reservedReturnAt).toBe('2026-07-07T10:00:00.000Z');
    expect(flat.activeStartAt).toBe('2026-07-01T08:00:00.000Z');
    expect(flat.activeKmIncluded).toBe(300);
    expect(flat.activeKmDriven).toBe(45);
  });
});
