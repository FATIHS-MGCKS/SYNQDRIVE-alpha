import { VehicleStatus } from '@prisma/client';
import {
  buildVehicleOperationalState,
  EMPTY_BOOKING_CONTEXT,
} from './vehicle-operational-state.builder';

/**
 * Characterization tests for V1 fleet operational-state derivation.
 *
 * These lock the current behavior before V2 semantic changes (Prompts 3–5).
 * Tests marked `@v2-behavior-change` document expectations that WILL change
 * when the reservation-window rules from vehicle-operational-state-v2.md
 * are implemented.
 */

const BOOKING_WITH_ACTIVE = {
  ...EMPTY_BOOKING_CONTEXT,
  activeBookingId: 'b-active-1',
  activeCustomerName: 'Jane Doe',
  activeReturnAt: '2026-04-25T12:00:00.000Z',
  activeReturnStationName: 'Station A',
  activeKmIncluded: 500,
  activeKmDriven: 120,
};

const BOOKING_WITH_RESERVED = {
  ...EMPTY_BOOKING_CONTEXT,
  reservedBookingId: 'b-reserved-1',
  reservedCustomerName: 'John Doe',
  reservedPickupAt: '2026-08-01T10:00:00.000Z',
  reservedReturnAt: '2026-08-06T18:00:00.000Z',
  reservedPickupStationName: 'Station B',
  reservedIsOverdue: false,
};

/** Simulates buildBookingContextMap output for a future CONFIRMED booking. */
const BOOKING_FUTURE_CONFIRMED = {
  ...EMPTY_BOOKING_CONTEXT,
  reservedBookingId: 'b-future-1',
  reservedCustomerName: 'Future Customer',
  reservedPickupAt: '2026-08-01T10:00:00.000+02:00',
  reservedReturnAt: '2026-08-06T18:00:00.000+02:00',
  reservedPickupStationName: 'Station C',
  reservedIsOverdue: false,
};

describe('buildVehicleOperationalState (V1 characterization)', () => {
  describe('precedence: Maintenance > Active Rented > Reserved > Available', () => {
    it('returns Maintenance when Vehicle.status=IN_SERVICE even with an ACTIVE booking', () => {
      const result = buildVehicleOperationalState({
        vehicle: { id: 'v1', status: VehicleStatus.IN_SERVICE },
        state: null,
        bookingCtx: BOOKING_WITH_ACTIVE,
        pickupOdoByBooking: new Map(),
      });

      expect(result.status).toBe('Maintenance');
      expect(result.maintenanceCtx.maintenanceReasonCode).toBe(
        'SCHEDULED_SERVICE',
      );
      expect(result.bookingDto.activeBookingId).toBeNull();
    });

    it('returns Active Rented when an ACTIVE booking exists and vehicle is AVAILABLE', () => {
      const result = buildVehicleOperationalState({
        vehicle: { id: 'v3', status: VehicleStatus.AVAILABLE },
        state: null,
        bookingCtx: BOOKING_WITH_ACTIVE,
        pickupOdoByBooking: new Map(),
      });

      expect(result.status).toBe('Active Rented');
      expect(result.bookingDto.activeBookingId).toBe('b-active-1');
    });

    it('returns Reserved when only a reserved booking exists', () => {
      const result = buildVehicleOperationalState({
        vehicle: { id: 'v4', status: VehicleStatus.AVAILABLE },
        state: null,
        bookingCtx: BOOKING_WITH_RESERVED,
        pickupOdoByBooking: new Map(),
      });

      expect(result.status).toBe('Reserved');
      expect(result.bookingDto.reservedBookingId).toBe('b-reserved-1');
    });

    it('prefers Active over Reserved when both are set on the same booking context', () => {
      const result = buildVehicleOperationalState({
        vehicle: { id: 'v5', status: VehicleStatus.AVAILABLE },
        state: null,
        bookingCtx: {
          ...EMPTY_BOOKING_CONTEXT,
          activeBookingId: BOOKING_WITH_ACTIVE.activeBookingId,
          activeCustomerName: BOOKING_WITH_ACTIVE.activeCustomerName,
          activeReturnAt: BOOKING_WITH_ACTIVE.activeReturnAt,
          activeReturnStationName: BOOKING_WITH_ACTIVE.activeReturnStationName,
          activeKmIncluded: BOOKING_WITH_ACTIVE.activeKmIncluded,
          activeKmDriven: BOOKING_WITH_ACTIVE.activeKmDriven,
          reservedBookingId: BOOKING_WITH_RESERVED.reservedBookingId,
          reservedCustomerName: BOOKING_WITH_RESERVED.reservedCustomerName,
          reservedPickupAt: BOOKING_WITH_RESERVED.reservedPickupAt,
          reservedPickupStationName:
            BOOKING_WITH_RESERVED.reservedPickupStationName,
        },
        pickupOdoByBooking: new Map(),
      });

      expect(result.status).toBe('Active Rented');
    });

    it('returns Available when no booking and vehicle is AVAILABLE', () => {
      const result = buildVehicleOperationalState({
        vehicle: { id: 'v6', status: VehicleStatus.AVAILABLE },
        state: null,
        bookingCtx: null,
        pickupOdoByBooking: new Map(),
      });

      expect(result.status).toBe('Available');
      expect(result.bookingDto).toEqual(EMPTY_BOOKING_CONTEXT);
    });
  });

  describe('booking context characterization', () => {
    /**
     * @v2-behavior-change
     * V2 (§5.3): CONFIRMED booking weeks before pickup window → AVAILABLE + nextBooking.
     * V1: any PENDING/CONFIRMED with endDate >= now yields Reserved immediately.
     */
    it('@v2-behavior-change future CONFIRMED booking currently yields Reserved', () => {
      const result = buildVehicleOperationalState({
        vehicle: { id: 'ks-fh-660e', status: VehicleStatus.AVAILABLE },
        state: null,
        bookingCtx: BOOKING_FUTURE_CONFIRMED,
        pickupOdoByBooking: new Map(),
      });

      expect(result.status).toBe('Reserved');
      expect(result.bookingDto.reservedBookingId).toBe('b-future-1');
      expect(result.bookingDto.reservedCustomerName).toBe('Future Customer');
    });

    it('ACTIVE booking context yields Active Rented regardless of raw AVAILABLE', () => {
      const result = buildVehicleOperationalState({
        vehicle: { id: 'v-active', status: VehicleStatus.AVAILABLE },
        state: null,
        bookingCtx: BOOKING_WITH_ACTIVE,
        pickupOdoByBooking: new Map(),
      });

      expect(result.status).toBe('Active Rented');
      expect(result.maintenanceCtx.maintenanceReason).toBeNull();
    });

    it('null booking context with AVAILABLE raw status stays Available', () => {
      const result = buildVehicleOperationalState({
        vehicle: { id: 'v-empty', status: VehicleStatus.AVAILABLE },
        state: null,
        bookingCtx: null,
        pickupOdoByBooking: new Map(),
      });

      expect(result.status).toBe('Available');
      expect(result.ghostStateWarning).toBeNull();
      expect(result.bookingDto).toEqual(EMPTY_BOOKING_CONTEXT);
    });
  });

  describe('ghost-state guard (raw RENTED/RESERVED without booking truth)', () => {
    it('demotes RENTED with no backing booking to Available and returns warning', () => {
      const result = buildVehicleOperationalState({
        vehicle: { id: 'v-ghost-1', status: VehicleStatus.RENTED },
        state: null,
        bookingCtx: null,
        pickupOdoByBooking: new Map(),
      });

      expect(result.status).toBe('Available');
      expect(result.bookingDto).toEqual(EMPTY_BOOKING_CONTEXT);
      expect(result.ghostStateWarning).toContain('Ghost Active Rented');
    });

    it('demotes RESERVED with no backing booking to Available and returns warning', () => {
      const result = buildVehicleOperationalState({
        vehicle: { id: 'v-ghost-2', status: VehicleStatus.RESERVED },
        state: null,
        bookingCtx: null,
        pickupOdoByBooking: new Map(),
      });

      expect(result.status).toBe('Available');
      expect(result.ghostStateWarning).toContain('Ghost Reserved');
    });

    it('does NOT warn when RENTED has a matching ACTIVE booking', () => {
      const result = buildVehicleOperationalState({
        vehicle: { id: 'v-legit', status: VehicleStatus.RENTED },
        state: null,
        bookingCtx: BOOKING_WITH_ACTIVE,
        pickupOdoByBooking: new Map(),
      });

      expect(result.status).toBe('Active Rented');
      expect(result.ghostStateWarning).toBeNull();
    });
  });

  describe('maintenance context fields', () => {
    it('populates maintenance reason codes for IN_SERVICE', () => {
      const result = buildVehicleOperationalState({
        vehicle: { id: 'v-maint', status: VehicleStatus.IN_SERVICE },
        state: null,
        bookingCtx: null,
        pickupOdoByBooking: new Map(),
      });

      expect(result.status).toBe('Maintenance');
      expect(result.maintenanceCtx).toEqual({
        maintenanceReason: 'Scheduled service',
        maintenanceReasonCode: 'SCHEDULED_SERVICE',
        maintenanceUrgency: 'planned',
      });
    });

    it('populates urgent maintenance for OUT_OF_SERVICE', () => {
      const result = buildVehicleOperationalState({
        vehicle: { id: 'v-blocked', status: VehicleStatus.OUT_OF_SERVICE },
        state: null,
        bookingCtx: null,
        pickupOdoByBooking: new Map(),
      });

      expect(result.maintenanceCtx.maintenanceReasonCode).toBe(
        'OPERATIONAL_BLOCK',
      );
      expect(result.maintenanceCtx.maintenanceUrgency).toBe('urgent');
    });
  });

  describe('null-preserving telemetry', () => {
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
        vehicle: { id: 'v21', status: VehicleStatus.RENTED },
        state: { odometerKm: 10500.9 },
        bookingCtx: { ...BOOKING_WITH_ACTIVE, activeKmDriven: null },
        pickupOdoByBooking: new Map([['b-active-1', 10000]]),
      });
      expect(result.liveKmDriven).toBe(500);
    });
  });
});
