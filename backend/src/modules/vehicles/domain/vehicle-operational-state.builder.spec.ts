import { VehicleStatus } from '@prisma/client';
import {
  buildVehicleOperationalState,
  buildVehicleOperationalStateFromEngineInput,
  EMPTY_BOOKING_CONTEXT,
} from './vehicle-operational-state.builder';
import type { VehicleStateEngineInput } from './vehicle-operational-state.engine.types';

/**
 * V2 characterization tests for canonical fleet operational-state derivation.
 * Uses prepared engine inputs — no reservation-window calculation changes here.
 */

const BASE_CONTEXT = {
  now: new Date('2026-07-15T12:00:00.000Z'),
  organizationTimezone: 'Europe/Berlin',
};

function fullEngineInput(
  overrides: Partial<VehicleStateEngineInput> = {},
): VehicleStateEngineInput {
  return {
    vehicle: {
      id: 'v-1',
      organizationId: 'org-1',
      rawStatus: VehicleStatus.AVAILABLE,
      licensePlate: 'AB-CD-1',
      tankCapacityLiters: 50,
      persistedAt: '2026-07-01T08:00:00.000Z',
      ...overrides.vehicle,
    },
    bookingState: {
      activeBooking: null,
      reservationWindowBooking: null,
      nextBooking: null,
      futureBookingCount: 0,
      dataQualityState: 'RELIABLE',
      dataQualityReasons: [],
      ...overrides.bookingState,
    },
    maintenanceState: {
      isMaintenance: false,
      reasonCodes: [],
      source: 'NONE',
      ...overrides.maintenanceState,
    },
    blockingState: {
      isBlocked: false,
      level: 'none',
      reasonCodes: [],
      source: 'NONE',
      ...overrides.blockingState,
    },
    context: {
      ...BASE_CONTEXT,
      ...overrides.context,
    },
    telemetry: overrides.telemetry ?? null,
    pickupOdoByBooking: overrides.pickupOdoByBooking ?? new Map(),
  };
}

const ACTIVE_BOOKING_REF = {
  id: 'b-active-1',
  bookingNumber: 'BK-000101',
  status: 'ACTIVE',
  pickupAt: '2026-07-15T08:00:00.000Z',
  returnAt: '2026-07-20T18:00:00.000Z',
  customerLabel: 'Jane Doe',
  vehicleId: 'v-1',
  phase: 'active_rental' as const,
  returnStationName: 'Station A',
  kmIncluded: 500,
  kmDriven: 120,
};

const RESERVATION_WINDOW_REF = {
  id: 'b-reserved-1',
  bookingNumber: 'BK-000102',
  status: 'CONFIRMED',
  pickupAt: '2026-08-01T10:00:00.000Z',
  returnAt: '2026-08-06T18:00:00.000Z',
  customerLabel: 'John Doe',
  vehicleId: 'v-1',
  phase: 'pickup_window' as const,
  pickupStationName: 'Station B',
};

const FUTURE_BOOKING_REF = {
  id: 'b-future-1',
  bookingNumber: 'BK-000103',
  status: 'CONFIRMED',
  pickupAt: '2026-08-01T10:00:00.000+02:00',
  returnAt: '2026-08-06T18:00:00.000+02:00',
  customerLabel: 'Future Customer',
  vehicleId: 'ks-fh-660e',
  phase: 'future' as const,
  pickupStationName: 'Station C',
};

describe('deriveCanonicalOperationalState (V2 characterization)', () => {
  describe('priority chain: Maintenance > Blocked > Active Rented > Reserved > Available', () => {
    it('returns MAINTENANCE when maintenance is active even with ACTIVE booking', () => {
      const output = buildVehicleOperationalStateFromEngineInput(
        fullEngineInput({
          vehicle: {
            id: 'v1',
            organizationId: 'org-1',
            rawStatus: VehicleStatus.IN_SERVICE,
          },
          maintenanceState: {
            isMaintenance: true,
            reasonCodes: ['SCHEDULED_SERVICE'],
            source: 'ADMIN_PERSISTED',
          },
          bookingState: {
            activeBooking: ACTIVE_BOOKING_REF,
            reservationWindowBooking: null,
            nextBooking: null,
            futureBookingCount: 0,
            dataQualityState: 'RELIABLE',
            dataQualityReasons: [],
          },
        }),
      );

      expect(output.operationalState.status).toBe('MAINTENANCE');
      expect(output.operationalState.reason).toBe('MAINTENANCE_ACTIVE');
      expect(output.bookingContext.activeBooking?.id).toBe('b-active-1');
      expect(output.legacy.bookingDto.activeBookingId).toBeNull();
    });

    it('returns ACTIVE_RENTED when an ACTIVE booking exists and vehicle is AVAILABLE', () => {
      const output = buildVehicleOperationalStateFromEngineInput(
        fullEngineInput({
          bookingState: {
            activeBooking: ACTIVE_BOOKING_REF,
            reservationWindowBooking: null,
            nextBooking: null,
            futureBookingCount: 0,
            dataQualityState: 'RELIABLE',
            dataQualityReasons: [],
          },
        }),
      );

      expect(output.operationalState.status).toBe('ACTIVE_RENTED');
      expect(output.operationalState.reason).toBe('ACTIVE_BOOKING');
      expect(output.legacy.status).toBe('Active Rented');
      expect(output.legacy.bookingDto.activeBookingId).toBe('b-active-1');
    });

    it('returns RESERVED when pickup window booking is active', () => {
      const output = buildVehicleOperationalStateFromEngineInput(
        fullEngineInput({
          bookingState: {
            activeBooking: null,
            reservationWindowBooking: RESERVATION_WINDOW_REF,
            nextBooking: null,
            futureBookingCount: 0,
            dataQualityState: 'RELIABLE',
            dataQualityReasons: [],
          },
        }),
      );

      expect(output.operationalState.status).toBe('RESERVED');
      expect(output.operationalState.reason).toBe('PICKUP_WINDOW_ACTIVE');
      expect(output.legacy.status).toBe('Reserved');
      expect(output.legacy.bookingDto.reservedBookingId).toBe('b-reserved-1');
    });

    it('prefers ACTIVE_RENTED over RESERVED when both refs are set (§15.4 prio 4 > 5)', () => {
      const output = buildVehicleOperationalStateFromEngineInput(
        fullEngineInput({
          bookingState: {
            activeBooking: ACTIVE_BOOKING_REF,
            reservationWindowBooking: RESERVATION_WINDOW_REF,
            nextBooking: null,
            futureBookingCount: 0,
            dataQualityState: 'RELIABLE',
            dataQualityReasons: [],
          },
        }),
      );

      expect(output.operationalState.status).toBe('ACTIVE_RENTED');
      expect(output.operationalState.reason).toBe('ACTIVE_BOOKING');
      expect(output.bookingContext.activeBooking?.id).toBe('b-active-1');
      expect(output.bookingContext.reservedBooking?.id).toBe('b-reserved-1');
    });

    it('returns AVAILABLE when no booking slots are set', () => {
      const output = buildVehicleOperationalStateFromEngineInput(
        fullEngineInput(),
      );

      expect(output.operationalState.status).toBe('AVAILABLE');
      expect(output.operationalState.reason).toBe('NO_ACTIVE_OR_UPCOMING_WINDOW');
      expect(output.legacy.status).toBe('Available');
      expect(output.legacy.bookingDto).toEqual(EMPTY_BOOKING_CONTEXT);
    });
  });

  describe('V2 booking context semantics', () => {
    it('future booking in two weeks yields AVAILABLE with nextBooking', () => {
      const output = buildVehicleOperationalStateFromEngineInput(
        fullEngineInput({
          vehicle: {
            id: 'ks-fh-660e',
            organizationId: 'org-1',
            rawStatus: VehicleStatus.AVAILABLE,
          },
          bookingState: {
            activeBooking: null,
            reservationWindowBooking: null,
            nextBooking: FUTURE_BOOKING_REF,
            futureBookingCount: 1,
            dataQualityState: 'RELIABLE',
            dataQualityReasons: [],
          },
        }),
      );

      expect(output.operationalState.status).toBe('AVAILABLE');
      expect(output.operationalState.reason).toBe('NO_ACTIVE_OR_UPCOMING_WINDOW');
      expect(output.bookingContext.nextBooking?.id).toBe('b-future-1');
      expect(output.bookingContext.reservedBooking).toBeNull();
      expect(output.legacy.status).toBe('Available');
      expect(output.legacy.bookingDto).toEqual(EMPTY_BOOKING_CONTEXT);
    });

    it('futureBookingCount alone does not change operational status', () => {
      const output = buildVehicleOperationalStateFromEngineInput(
        fullEngineInput({
          bookingState: {
            activeBooking: null,
            reservationWindowBooking: null,
            nextBooking: null,
            futureBookingCount: 3,
            dataQualityState: 'RELIABLE',
            dataQualityReasons: [],
          },
        }),
      );

      expect(output.operationalState.status).toBe('AVAILABLE');
      expect(output.bookingContext.futureBookingCount).toBe(3);
    });

    it('DEGRADED booking state yields UNKNOWN', () => {
      const output = buildVehicleOperationalStateFromEngineInput(
        fullEngineInput({
          bookingState: {
            activeBooking: null,
            reservationWindowBooking: null,
            nextBooking: null,
            futureBookingCount: 0,
            dataQualityState: 'DEGRADED',
            dataQualityReasons: ['BOOKING_PARTIAL_RESULT'],
          },
        }),
      );

      expect(output.operationalState.status).toBe('UNKNOWN');
      expect(output.operationalState.reason).toBe('BOOKING_STATE_INCONSISTENT');
      expect(output.operationalState.isReliable).toBe(false);
      expect(output.operationalState.dataQualityState).toBe('DEGRADED');
    });
  });

  describe('ghost-state guard (raw RENTED/RESERVED without booking truth)', () => {
    it('raw RENTED without active booking yields UNKNOWN and warning', () => {
      const output = buildVehicleOperationalStateFromEngineInput(
        fullEngineInput({
          vehicle: {
            id: 'v-ghost-1',
            organizationId: 'org-1',
            rawStatus: VehicleStatus.RENTED,
          },
        }),
      );

      expect(output.operationalState.status).toBe('UNKNOWN');
      expect(output.operationalState.reason).toBe('RAW_STATUS_INCONSISTENT');
      expect(output.legacy.status).toBe('Unknown');
      expect(output.legacy.ghostStateWarning).toContain('no demotion to Available');
      expect(output.diagnosticReasons).toEqual(
        expect.arrayContaining([
          'RAW_STATUS_LEGACY_RENTED',
          'RAW_STATUS_INCONSISTENT',
        ]),
      );
    });

    it('raw RENTED with matching ACTIVE booking yields ACTIVE_RENTED without ghost warning', () => {
      const output = buildVehicleOperationalStateFromEngineInput(
        fullEngineInput({
          vehicle: {
            id: 'v-ok-rented',
            organizationId: 'org-1',
            rawStatus: VehicleStatus.RENTED,
          },
          bookingState: {
            activeBooking: ACTIVE_BOOKING_REF,
            reservationWindowBooking: null,
            nextBooking: null,
            futureBookingCount: 0,
            dataQualityState: 'RELIABLE',
            dataQualityReasons: [],
          },
        }),
      );

      expect(output.operationalState.status).toBe('ACTIVE_RENTED');
      expect(output.operationalState.reason).toBe('ACTIVE_BOOKING');
      expect(output.legacy.status).toBe('Active Rented');
      expect(output.legacy.ghostStateWarning).toBeNull();
    });

    it('raw RESERVED without reservation window yields UNKNOWN', () => {
      const output = buildVehicleOperationalStateFromEngineInput(
        fullEngineInput({
          vehicle: {
            id: 'v-ghost-2',
            organizationId: 'org-1',
            rawStatus: VehicleStatus.RESERVED,
          },
        }),
      );

      expect(output.operationalState.status).toBe('UNKNOWN');
      expect(output.operationalState.reason).toBe('RAW_STATUS_INCONSISTENT');
      expect(output.legacy.status).toBe('Unknown');
    });

    it('raw RESERVED with reservation window yields RESERVED without ghost warning', () => {
      const output = buildVehicleOperationalStateFromEngineInput(
        fullEngineInput({
          vehicle: {
            id: 'v-ok-reserved',
            organizationId: 'org-1',
            rawStatus: VehicleStatus.RESERVED,
          },
          bookingState: {
            activeBooking: null,
            reservationWindowBooking: RESERVATION_WINDOW_REF,
            nextBooking: null,
            futureBookingCount: 0,
            dataQualityState: 'RELIABLE',
            dataQualityReasons: [],
          },
        }),
      );

      expect(output.operationalState.status).toBe('RESERVED');
      expect(output.legacy.status).toBe('Reserved');
      expect(output.legacy.ghostStateWarning).toBeNull();
    });

    it('raw RENTED with DEGRADED booking data yields UNKNOWN with BOOKING_DATA_UNAVAILABLE', () => {
      const output = buildVehicleOperationalStateFromEngineInput(
        fullEngineInput({
          vehicle: {
            id: 'v-degraded-rented',
            organizationId: 'org-1',
            rawStatus: VehicleStatus.RENTED,
          },
          bookingState: {
            activeBooking: null,
            reservationWindowBooking: null,
            nextBooking: null,
            futureBookingCount: 0,
            dataQualityState: 'DEGRADED',
            dataQualityReasons: ['BOOKING_PARTIAL_RESULT'],
          },
        }),
      );

      expect(output.operationalState.status).toBe('UNKNOWN');
      expect(output.operationalState.reason).toBe('BOOKING_DATA_UNAVAILABLE');
      expect(output.legacy.status).toBe('Unknown');
      expect(output.legacy.ghostStateWarning).toBeNull();
    });

    it('raw AVAILABLE with active booking keeps ACTIVE_RENTED and warns mismatch', () => {
      const output = buildVehicleOperationalStateFromEngineInput(
        fullEngineInput({
          bookingState: {
            activeBooking: ACTIVE_BOOKING_REF,
            reservationWindowBooking: null,
            nextBooking: null,
            futureBookingCount: 0,
            dataQualityState: 'RELIABLE',
            dataQualityReasons: [],
          },
        }),
      );

      expect(output.operationalState.status).toBe('ACTIVE_RENTED');
      expect(output.legacy.status).toBe('Active Rented');
      expect(output.legacy.ghostStateWarning).toMatch(/Raw AVAILABLE mismatch/);
      expect(output.diagnosticReasons).toContain('RAW_STATUS_INCONSISTENT');
      expect(output.rawVehicleStatus.diagnosticCodes).toContain(
        'CONFLICTS_WITH_OPERATIONAL_STATE',
      );
    });

    it('raw AVAILABLE with reservation window keeps RESERVED and warns mismatch', () => {
      const output = buildVehicleOperationalStateFromEngineInput(
        fullEngineInput({
          bookingState: {
            activeBooking: null,
            reservationWindowBooking: RESERVATION_WINDOW_REF,
            nextBooking: null,
            futureBookingCount: 0,
            dataQualityState: 'RELIABLE',
            dataQualityReasons: [],
          },
        }),
      );

      expect(output.operationalState.status).toBe('RESERVED');
      expect(output.legacy.status).toBe('Reserved');
      expect(output.legacy.ghostStateWarning).toMatch(/Raw AVAILABLE mismatch/);
      expect(output.diagnosticReasons).toContain('RAW_STATUS_INCONSISTENT');
    });
  });

  describe('operationalState metadata', () => {
    it('fills reason, source, derivedAt, dataQualityState and isReliable', () => {
      const output = buildVehicleOperationalStateFromEngineInput(
        fullEngineInput({
          vehicle: {
            id: 'v-1',
            organizationId: 'org-1',
            rawStatus: VehicleStatus.RESERVED,
          },
          bookingState: {
            activeBooking: null,
            reservationWindowBooking: RESERVATION_WINDOW_REF,
            nextBooking: null,
            futureBookingCount: 0,
            dataQualityState: 'RELIABLE',
            dataQualityReasons: [],
          },
        }),
      );

      expect(output.operationalState).toMatchObject({
        status: 'RESERVED',
        reason: 'PICKUP_WINDOW_ACTIVE',
        source: 'BOOKING_LIFECYCLE',
        derivedAt: BASE_CONTEXT.now.toISOString(),
        dataQualityState: 'RELIABLE',
        isReliable: true,
      });
      expect(output.operationalState.effectiveFrom).toBe(
        RESERVATION_WINDOW_REF.pickupAt,
      );
      expect(output.operationalState.effectiveUntil).toBe(
        RESERVATION_WINDOW_REF.returnAt,
      );
    });
  });

  describe('maintenance context fields (legacy projection)', () => {
    it('populates maintenance reason codes for IN_SERVICE', () => {
      const output = buildVehicleOperationalStateFromEngineInput(
        fullEngineInput({
          vehicle: {
            id: 'v-maint',
            organizationId: 'org-1',
            rawStatus: VehicleStatus.IN_SERVICE,
          },
          maintenanceState: {
            isMaintenance: true,
            reasonCodes: ['SCHEDULED_SERVICE'],
            source: 'ADMIN_PERSISTED',
          },
        }),
      );

      expect(output.legacy.status).toBe('Maintenance');
      expect(output.legacy.maintenanceCtx).toEqual({
        maintenanceReason: 'Scheduled service',
        maintenanceReasonCode: 'SCHEDULED_SERVICE',
        maintenanceUrgency: 'planned',
      });
    });

    it('populates urgent maintenance for OUT_OF_SERVICE hard block', () => {
      const output = buildVehicleOperationalStateFromEngineInput(
        fullEngineInput({
          vehicle: {
            id: 'v-blocked',
            organizationId: 'org-1',
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

      expect(output.operationalState.status).toBe('BLOCKED');
      expect(output.legacy.status).toBe('Maintenance');
      expect(output.legacy.maintenanceCtx.maintenanceReasonCode).toBe(
        'OPERATIONAL_BLOCK',
      );
    });
  });

  describe('null-preserving telemetry via legacy wrapper', () => {
    it('returns null telemetry fields when state is null', () => {
      const result = buildVehicleOperationalState({
        vehicle: { id: 'v7', status: VehicleStatus.AVAILABLE },
        state: null,
        bookingCtx: null,
        pickupOdoByBooking: new Map(),
      });

      expect(result.odometerKm).toBeNull();
      expect(result.fuelPercent).toBeNull();
      expect(result.evSoc).toBeNull();
      expect(result.liveKmDriven).toBeNull();
    });
  });

  describe('liveKmDriven', () => {
    it('derives liveKmDriven from pickupOdo + current odometer', () => {
      const result = buildVehicleOperationalState({
        vehicle: { id: 'v21', status: VehicleStatus.AVAILABLE },
        state: { odometerKm: 10500.9 },
        bookingCtx: {
          ...EMPTY_BOOKING_CONTEXT,
          activeBookingId: 'b-active-1',
          activeKmDriven: null,
        },
        pickupOdoByBooking: new Map([['b-active-1', 10000]]),
      });
      expect(result.liveKmDriven).toBe(500);
    });
  });
});
