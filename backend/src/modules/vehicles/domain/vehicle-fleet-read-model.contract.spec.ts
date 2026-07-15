import { VehicleStatus } from '@prisma/client';
import { VehiclesService } from '../vehicles.service';
import { extractOperationalContractSlice } from './vehicle-fleet-read-model.projector';
import {
  MATRIX_BOOKINGS,
  matrixEngineInput,
} from './vehicle-operational-state.engine.test-fixtures';
import type { VehicleStateEngineBookingStateInput } from './vehicle-operational-state.engine.types';
import type { FleetOperationalContextBundle } from './vehicle-fleet-read-model.types';

function makeService(): VehiclesService {
  const stub = (): any => ({});
  return new (VehiclesService as any)(
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
  );
}

function buildBundle(
  bookingState: VehicleStateEngineBookingStateInput,
): FleetOperationalContextBundle {
  const map = new Map<string, VehicleStateEngineBookingStateInput>();
  map.set('v-contract', bookingState);
  return {
    organizationId: 'org-1',
    organizationTimezone: 'Europe/Berlin',
    tripStateMap: new Map(),
    bookingContextMap: map,
    pickupOdoByBooking: new Map(),
  };
}

describe('vehicle-fleet-read-model contract', () => {
  let service: VehiclesService;

  beforeEach(() => {
    service = makeService();
  });

  const scenarios = [
    {
      name: 'active rental',
      rawStatus: VehicleStatus.AVAILABLE,
      bookingState: {
        activeBooking: MATRIX_BOOKINGS.activeRental,
        reservationWindowBooking: null,
        nextBooking: null,
        futureBookingCount: 0,
        futureBookings: [],
        dataQualityState: 'RELIABLE' as const,
        dataQualityReasons: [],
      },
    },
    {
      name: 'reservation window',
      rawStatus: VehicleStatus.AVAILABLE,
      bookingState: {
        activeBooking: null,
        reservationWindowBooking: MATRIX_BOOKINGS.reservationWindow,
        nextBooking: null,
        futureBookingCount: 0,
        futureBookings: [],
        dataQualityState: 'RELIABLE' as const,
        dataQualityReasons: [],
      },
    },
    {
      name: 'future booking only',
      rawStatus: VehicleStatus.AVAILABLE,
      bookingState: {
        activeBooking: null,
        reservationWindowBooking: null,
        nextBooking: MATRIX_BOOKINGS.nextInTwoWeeks,
        futureBookingCount: 1,
        futureBookings: [],
        dataQualityState: 'RELIABLE' as const,
        dataQualityReasons: [],
      },
    },
    {
      name: 'active plus next',
      rawStatus: VehicleStatus.RENTED,
      bookingState: {
        activeBooking: MATRIX_BOOKINGS.activeRental,
        reservationWindowBooking: null,
        nextBooking: MATRIX_BOOKINGS.nextInTwoWeeks,
        futureBookingCount: 0,
        futureBookings: [],
        dataQualityState: 'RELIABLE' as const,
        dataQualityReasons: [],
      },
    },
    {
      name: 'degraded booking data',
      rawStatus: VehicleStatus.AVAILABLE,
      bookingState: {
        activeBooking: null,
        reservationWindowBooking: null,
        nextBooking: null,
        futureBookingCount: 0,
        futureBookings: [],
        dataQualityState: 'DEGRADED' as const,
        dataQualityReasons: ['BOOKING_PARTIAL_RESULT'],
      },
    },
    {
      name: 'unavailable booking query',
      rawStatus: VehicleStatus.AVAILABLE,
      bookingState: {
        activeBooking: null,
        reservationWindowBooking: null,
        nextBooking: null,
        futureBookingCount: 0,
        futureBookings: [],
        dataQualityState: 'UNAVAILABLE' as const,
        dataQualityReasons: ['BOOKING_QUERY_FAILED'],
      },
    },
  ] as const;

  it.each(scenarios)(
    'returns identical operational contract across fleet list, map, compact, and admin read models ($name)',
    ({ rawStatus, bookingState }) => {
      const bundle = buildBundle({
        ...bookingState,
        futureBookings: [...(bookingState.futureBookings ?? [])],
        dataQualityReasons: [...bookingState.dataQualityReasons],
      } as VehicleStateEngineBookingStateInput);
      const vehicleBase = {
        id: 'v-contract',
        organizationId: 'org-1',
        licensePlate: 'SD-CONTRACT',
        vehicleName: 'Contract Car',
        make: 'VW',
        model: 'Golf',
        year: 2024,
        status: rawStatus,
        fuelType: 'GASOLINE' as const,
        healthStatus: 'GOOD' as const,
        cleaningStatus: 'CLEAN' as const,
        tankCapacityLiters: 50,
        homeStation: { id: 'st-1', name: 'Main' },
        latestState: null,
      };

      const listRow = service.mapToVehicleData(
        vehicleBase,
        bundle.tripStateMap,
        bundle.bookingContextMap,
        bundle.pickupOdoByBooking,
        {
          organizationId: bundle.organizationId,
          organizationTimezone: bundle.organizationTimezone,
        },
      );

      const mapRow = service.mapToFleetMapVehicle(vehicleBase, bundle);
      const compactRow = service.mapToCompactOperationalVehicle(
        vehicleBase,
        bundle,
      );
      const adminRow = service.mapToRegisteredVehicle(
        {
          ...vehicleBase,
          organizationId: 'org-1',
          healthStatus: 'GOOD',
          fuelType: 'GASOLINE',
          mileageKm: 0,
        },
        bundle.tripStateMap,
        bundle,
      );

      const expected = extractOperationalContractSlice(
        service.projectFleetOperationalForVehicle(vehicleBase, bundle),
      );

      for (const row of [listRow, mapRow, compactRow, adminRow]) {
        expect(row.operationalState).toBeDefined();
        const operationalState = row.operationalState!;
        expect(operationalState.status).toBe(expected.status);
        expect(operationalState.reason).toBe(expected.reason);
        expect(operationalState.dataQualityState).toBe(
          expected.dataQualityState,
        );
        expect(operationalState.isReliable).toBe(expected.isReliable);
      }

      expect(listRow.bookingContext).toEqual(mapRow.bookingContext);
      expect(compactRow.bookingContext).toEqual(mapRow.bookingContext);
      expect(adminRow.bookingContext).toEqual(mapRow.bookingContext);
    },
  );

  it('aligns engine matrix fixture with fleet read-model projection', () => {
    const input = matrixEngineInput({
      vehicle: {
        id: 'v-matrix',
        organizationId: 'org-1',
        rawStatus: VehicleStatus.AVAILABLE,
      },
      bookingState: {
        activeBooking: MATRIX_BOOKINGS.activeRental,
        reservationWindowBooking: null,
        nextBooking: MATRIX_BOOKINGS.nextInTwoWeeks,
        futureBookingCount: 1,
        dataQualityState: 'RELIABLE',
        dataQualityReasons: [],
      },
    });

    const bundle = buildBundle(input.bookingState);
    bundle.bookingContextMap.set('v-matrix', input.bookingState);

    const fleetCtx = service.projectFleetOperationalForVehicle(
      {
        id: 'v-matrix',
        status: VehicleStatus.AVAILABLE,
      },
      { ...bundle, organizationId: 'org-1' },
    );

    expect(fleetCtx.operationalState.status).toBe('ACTIVE_RENTED');
    expect(fleetCtx.bookingContext.activeBooking?.id).toBe('b-active');
    expect(fleetCtx.bookingContext.nextBooking?.id).toBe('b-future-2w');
    expect(fleetCtx.bookingContext.reservedBooking).toBeNull();
  });
});
