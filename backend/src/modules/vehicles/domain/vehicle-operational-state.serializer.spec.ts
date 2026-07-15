import { VehicleStatus } from '@prisma/client';
import {
  buildVehicleOperationalStateFromEngineInput,
} from './vehicle-operational-state.builder';
import {
  canonicalOperationalStatusToLegacyLabel,
  serializeFleetOperationalStateProjection,
} from './vehicle-operational-state.serializer';
import {
  MATRIX_BOOKINGS,
  matrixEngineInput,
} from './vehicle-operational-state.engine.test-fixtures';

describe('vehicle-operational-state.serializer', () => {
  function project(
    input: ReturnType<typeof matrixEngineInput>,
    includeRaw = false,
  ) {
    const output = buildVehicleOperationalStateFromEngineInput(input);
    return serializeFleetOperationalStateProjection(output, {
      includeRawVehicleStatus: includeRaw,
    });
  }

  it('maps AVAILABLE with full data quality transport', () => {
    const dto = project(
      matrixEngineInput({
        bookingState: {
          activeBooking: null,
          reservationWindowBooking: null,
          nextBooking: MATRIX_BOOKINGS.nextInTwoWeeks,
          futureBookingCount: 0,
          dataQualityState: 'RELIABLE',
          dataQualityReasons: [],
        },
      }),
    );

    expect(dto.operationalState.status).toBe('AVAILABLE');
    expect(dto.operationalState.reason).toBe('NO_ACTIVE_OR_UPCOMING_WINDOW');
    expect(dto.operationalState.source).toBe('DERIVATION_ENGINE');
    expect(dto.operationalState.dataQualityState).toBe('RELIABLE');
    expect(dto.operationalState.dataQualityReasons).toEqual([]);
    expect(dto.operationalState.isReliable).toBe(true);
    expect(dto.operationalState.derivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(dto.status).toBe('Available');
    expect(dto.status).toBe(
      canonicalOperationalStatusToLegacyLabel(dto.operationalState.status),
    );
  });

  it('maps RESERVED in pickup window', () => {
    const dto = project(
      matrixEngineInput({
        bookingState: {
          activeBooking: null,
          reservationWindowBooking: MATRIX_BOOKINGS.reservationWindow,
          nextBooking: null,
          futureBookingCount: 0,
          dataQualityState: 'RELIABLE',
          dataQualityReasons: [],
        },
      }),
    );

    expect(dto.operationalState.status).toBe('RESERVED');
    expect(dto.operationalState.reason).toBe('PICKUP_WINDOW_ACTIVE');
    expect(dto.operationalState.source).toBe('BOOKING_LIFECYCLE');
    expect(dto.status).toBe('Reserved');
    expect(dto.status).toBe(
      canonicalOperationalStatusToLegacyLabel('RESERVED'),
    );
  });

  it('maps ACTIVE_RENTED from active booking', () => {
    const dto = project(
      matrixEngineInput({
        bookingState: {
          activeBooking: MATRIX_BOOKINGS.activeRental,
          reservationWindowBooking: null,
          nextBooking: null,
          futureBookingCount: 0,
          dataQualityState: 'RELIABLE',
          dataQualityReasons: [],
        },
      }),
    );

    expect(dto.operationalState.status).toBe('ACTIVE_RENTED');
    expect(dto.operationalState.reason).toBe('ACTIVE_BOOKING');
    expect(dto.operationalState.effectiveFrom).toBe(
      MATRIX_BOOKINGS.activeRental.pickupAt,
    );
    expect(dto.status).toBe('Active Rented');
  });

  it('maps MAINTENANCE from IN_SERVICE raw status', () => {
    const dto = project(
      matrixEngineInput({
        vehicle: {
          id: 'v-matrix-1',
          organizationId: 'org-matrix',
          rawStatus: VehicleStatus.IN_SERVICE,
        },
        maintenanceState: {
          isMaintenance: true,
          reasonCodes: ['SCHEDULED_SERVICE'],
          source: 'ADMIN_PERSISTED',
        },
      }),
    );

    expect(dto.operationalState.status).toBe('MAINTENANCE');
    expect(dto.operationalState.reason).toBe('MAINTENANCE_ACTIVE');
    expect(dto.operationalState.source).toBe('ADMIN_PERSISTED');
    expect(dto.status).toBe('Maintenance');
  });

  it('maps BLOCKED from OUT_OF_SERVICE raw status', () => {
    const dto = project(
      matrixEngineInput({
        vehicle: {
          id: 'v-matrix-1',
          organizationId: 'org-matrix',
          rawStatus: VehicleStatus.OUT_OF_SERVICE,
        },
        blockingState: {
          isBlocked: true,
          level: 'hard',
          reasonCodes: ['OPERATIONAL_BLOCK'],
          source: 'ADMIN_PERSISTED',
        },
      }),
    );

    expect(dto.operationalState.status).toBe('BLOCKED');
    expect(dto.operationalState.reason).toBe('HARD_BLOCK_ACTIVE');
    expect(dto.status).toBe('Blocked');
    expect(dto.status).not.toBe('Maintenance');
  });

  it('maps UNKNOWN on booking data unavailable', () => {
    const dto = project(
      matrixEngineInput({
        bookingState: {
          activeBooking: undefined,
          reservationWindowBooking: undefined,
          nextBooking: undefined,
          futureBookingCount: 0,
          dataQualityState: 'UNAVAILABLE',
          dataQualityReasons: ['BOOKING_QUERY_FAILED'],
        },
      }),
    );

    expect(dto.operationalState.status).toBe('UNKNOWN');
    expect(dto.operationalState.reason).toBe('BOOKING_DATA_UNAVAILABLE');
    expect(dto.operationalState.dataQualityState).toBe('UNAVAILABLE');
    expect(dto.operationalState.isReliable).toBe(false);
    expect(dto.status).toBe('Unknown');
  });

  it('exposes rawVehicleStatus only when requested — separate from legacy status', () => {
    const input = matrixEngineInput({
      vehicle: {
        id: 'v-matrix-1',
        organizationId: 'org-matrix',
        rawStatus: VehicleStatus.RENTED,
      },
      bookingState: {
        activeBooking: null,
        reservationWindowBooking: null,
        nextBooking: null,
        futureBookingCount: 0,
        dataQualityState: 'RELIABLE',
        dataQualityReasons: [],
      },
    });

    const withoutRaw = project(input, false);
    const withRaw = project(input, true);

    expect(withoutRaw.rawVehicleStatus).toBeUndefined();
    expect(withRaw.rawVehicleStatus).toEqual(
      expect.objectContaining({
        value: 'RENTED',
        isLegacyOrInconsistent: true,
        diagnosticCodes: expect.arrayContaining(['LEGACY_RENTED_PERSISTED']),
      }),
    );
    expect(withRaw.status).toBe('Unknown');
    expect(withRaw.rawVehicleStatus?.value).toBe('RENTED');
    expect(withRaw.status).not.toBe(withRaw.rawVehicleStatus?.value);
  });

  it('uses ISO timestamps for effectiveFrom/effectiveUntil when present', () => {
    const dto = project(
      matrixEngineInput({
        bookingState: {
          activeBooking: MATRIX_BOOKINGS.activeRental,
          reservationWindowBooking: null,
          nextBooking: null,
          futureBookingCount: 0,
          dataQualityState: 'RELIABLE',
          dataQualityReasons: [],
        },
      }),
    );

    expect(dto.operationalState.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(dto.operationalState.effectiveUntil).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
