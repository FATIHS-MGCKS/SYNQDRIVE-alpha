import { VehicleStatus } from '@prisma/client';
import { VehiclesService } from './vehicles.service';

/**
 * V4.6.86 — Hard verification audit follow-up.
 *
 * The Fleet Status product rules are small but non-negotiable:
 *   1. `Maintenance` always wins over any booking truth — a vehicle in
 *      IN_SERVICE / OUT_OF_SERVICE must never show up as `Active Rented`
 *      even if there is a stale ACTIVE booking in the DB.
 *   2. A booking-derived `Active Rented` / `Reserved` must always win
 *      over the DB `Vehicle.status` column when the two disagree.
 *   3. If the DB column says `RENTED` / `RESERVED` but no matching
 *      booking row backs it (admin forced the column, or a booking was
 *      hard-deleted), we MUST NOT render a ghost card with empty
 *      customer / return / pickup fields. Fall back to `Available` and
 *      emit a warning.
 *   4. Null-preserving telemetry: missing `odometerKm` / `fuelPercent` /
 *      `evSoc` / `activeKmDriven` must stay `null`, never be coerced to
 *      `0`. `0` is a valid reading ("empty tank") and must survive.
 *
 * These tests are the regression gate for `deriveFleetStatusContext` —
 * the single canonical function both `/vehicles` and `/fleet-map` call.
 * All other module-specific behaviour (telemetry shape, RentalHealth,
 * DIMO wiring) is covered by its own spec file.
 */

function makeService(): VehiclesService {
  // `deriveFleetStatusContext` is a pure function over its input — no
  // prisma / redis / dimo calls. Everything else on VehiclesService is
  // opaque to the function under test, so we construct a lean instance
  // by bypassing the DI container. If any of these dependencies start
  // being exercised, the test will throw loudly on the unknown access.
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

const EMPTY_BOOKING = VehiclesService.EMPTY_BOOKING_CONTEXT;

const BOOKING_WITH_ACTIVE = {
  ...EMPTY_BOOKING,
  activeBookingId: 'b-active-1',
  activeCustomerName: 'Jane Doe',
  activeReturnAt: '2026-04-25T12:00:00.000Z',
  activeReturnStationName: 'Station A',
  activeKmIncluded: 500,
  activeKmDriven: 120,
};

const BOOKING_WITH_RESERVED = {
  ...EMPTY_BOOKING,
  reservedBookingId: 'b-reserved-1',
  reservedCustomerName: 'John Doe',
  reservedPickupAt: '2026-04-25T09:00:00.000Z',
  reservedPickupStationName: 'Station B',
  reservedIsOverdue: false,
};

describe('VehiclesService.deriveFleetStatusContext (V4.6.86)', () => {
  let service: VehiclesService;

  beforeEach(() => {
    service = makeService();
  });

  describe('precedence: Maintenance > Active Rented > Reserved > Available', () => {
    it('returns Maintenance when Vehicle.status=IN_SERVICE even with an ACTIVE booking', () => {
      const result = service.deriveFleetStatusContext({
        vehicle: { id: 'v1', status: VehicleStatus.IN_SERVICE },
        state: null,
        bookingCtx: BOOKING_WITH_ACTIVE,
        pickupOdoByBooking: new Map(),
      });

      expect(result.status).toBe('Maintenance');
      expect(result.maintenanceCtx.maintenanceReasonCode).toBe(
        'SCHEDULED_SERVICE',
      );
      expect(result.maintenanceCtx.maintenanceUrgency).toBe('planned');
      // Booking context must be dropped on Maintenance — a workshop
      // card rendering a customer name would be nonsense.
      expect(result.bookingDto.activeBookingId).toBeNull();
      expect(result.bookingDto.activeCustomerName).toBeNull();
    });

    it('returns Blocked when Vehicle.status=OUT_OF_SERVICE (urgent)', () => {
      const result = service.deriveFleetStatusContext({
        vehicle: { id: 'v2', status: VehicleStatus.OUT_OF_SERVICE },
        state: null,
        bookingCtx: null,
        pickupOdoByBooking: new Map(),
      });

      expect(result.status).toBe('Blocked');
      expect(result.maintenanceCtx.maintenanceReasonCode).toBe(
        'OPERATIONAL_BLOCK',
      );
      expect(result.maintenanceCtx.maintenanceUrgency).toBe('urgent');
      expect(result.operationalState.status).toBe('BLOCKED');
    });

    it('returns Active Rented when an ACTIVE booking exists and vehicle is AVAILABLE', () => {
      const result = service.deriveFleetStatusContext({
        vehicle: { id: 'v3', status: VehicleStatus.AVAILABLE },
        state: null,
        bookingCtx: BOOKING_WITH_ACTIVE,
        pickupOdoByBooking: new Map(),
      });

      expect(result.status).toBe('Active Rented');
      expect(result.bookingDto.activeBookingId).toBe('b-active-1');
      expect(result.bookingDto.activeCustomerName).toBe('Jane Doe');
    });

    it('returns Reserved when only a reserved booking exists', () => {
      const result = service.deriveFleetStatusContext({
        vehicle: { id: 'v4', status: VehicleStatus.AVAILABLE },
        state: null,
        bookingCtx: BOOKING_WITH_RESERVED,
        pickupOdoByBooking: new Map(),
      });

      expect(result.status).toBe('Reserved');
      expect(result.bookingDto.reservedBookingId).toBe('b-reserved-1');
      expect(result.bookingDto.reservedCustomerName).toBe('John Doe');
    });

    it('prefers Active over Reserved when both are set on the same booking context', () => {
      const result = service.deriveFleetStatusContext({
        vehicle: { id: 'v5', status: VehicleStatus.AVAILABLE },
        state: null,
        bookingCtx: {
          ...EMPTY_BOOKING,
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
      const result = service.deriveFleetStatusContext({
        vehicle: { id: 'v6', status: VehicleStatus.AVAILABLE },
        state: null,
        bookingCtx: null,
        pickupOdoByBooking: new Map(),
      });

      expect(result.status).toBe('Available');
      expect(result.bookingDto).toEqual(EMPTY_BOOKING);
      expect(result.maintenanceCtx.maintenanceReason).toBeNull();
    });

    it('returns Unknown for unrecognised Vehicle.status — never Available', () => {
      const result = service.deriveFleetStatusContext({
        vehicle: { id: 'v-unknown', status: 'GARBAGE_STATUS' as VehicleStatus },
        state: null,
        bookingCtx: null,
        pickupOdoByBooking: new Map(),
      });

      expect(result.status).toBe('Unknown');
      expect(result.status).not.toBe('Available');
      expect(result.operationalState.status).toBe('UNKNOWN');
    });
  });

  describe('ghost-state guard', () => {
    it('demotes RENTED with no backing booking to Available and warns', () => {
      const warnSpy = jest
        .spyOn((service as any).logger, 'warn')
        .mockImplementation(() => undefined);

      const result = service.deriveFleetStatusContext({
        vehicle: { id: 'v-ghost-1', status: VehicleStatus.RENTED },
        state: null,
        bookingCtx: null,
        pickupOdoByBooking: new Map(),
      });

      expect(result.status).toBe('Available');
      expect(result.bookingDto).toEqual(EMPTY_BOOKING);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Ghost Active Rented'),
      );
      warnSpy.mockRestore();
    });

    it('demotes RESERVED with no backing booking to Available and warns', () => {
      const warnSpy = jest
        .spyOn((service as any).logger, 'warn')
        .mockImplementation(() => undefined);

      const result = service.deriveFleetStatusContext({
        vehicle: { id: 'v-ghost-2', status: VehicleStatus.RESERVED },
        state: null,
        bookingCtx: null,
        pickupOdoByBooking: new Map(),
      });

      expect(result.status).toBe('Available');
      expect(result.bookingDto).toEqual(EMPTY_BOOKING);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Ghost Reserved'),
      );
      warnSpy.mockRestore();
    });

    it('does NOT warn when RENTED has a matching ACTIVE booking', () => {
      const warnSpy = jest
        .spyOn((service as any).logger, 'warn')
        .mockImplementation(() => undefined);

      const result = service.deriveFleetStatusContext({
        vehicle: { id: 'v-legit', status: VehicleStatus.RENTED },
        state: null,
        bookingCtx: BOOKING_WITH_ACTIVE,
        pickupOdoByBooking: new Map(),
      });

      expect(result.status).toBe('Active Rented');
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('null-preserving telemetry', () => {
    it('returns null for odometerKm / fuelPercent / evSoc when state is null', () => {
      const result = service.deriveFleetStatusContext({
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

    it('returns null for fuelPercent when both fuel signals are null (no 0 coercion)', () => {
      const result = service.deriveFleetStatusContext({
        vehicle: { id: 'v8', status: VehicleStatus.AVAILABLE },
        state: {
          odometerKm: 12345,
          evSoc: null,
          fuelLevelRelative: null,
          fuelLevelAbsolute: null,
        },
        bookingCtx: null,
        pickupOdoByBooking: new Map(),
      });

      expect(result.odometerKm).toBe(12345);
      expect(result.fuelPercent).toBeNull();
      expect(result.evSoc).toBeNull();
    });

    it('preserves 0 as a valid "empty tank" reading (does not collapse to null)', () => {
      const result = service.deriveFleetStatusContext({
        vehicle: { id: 'v9', status: VehicleStatus.AVAILABLE },
        state: {
          odometerKm: 0,
          evSoc: 0,
          fuelLevelRelative: 0,
          fuelLevelAbsolute: null,
        },
        bookingCtx: null,
        pickupOdoByBooking: new Map(),
      });

      expect(result.odometerKm).toBe(0);
      expect(result.fuelPercent).toBe(0);
      expect(result.evSoc).toBe(0);
    });

    it('floors odometer and ceils SoC (matches UI formatters)', () => {
      const result = service.deriveFleetStatusContext({
        vehicle: { id: 'v10', status: VehicleStatus.AVAILABLE },
        state: {
          odometerKm: 12345.89,
          evSoc: 42.1,
          fuelLevelRelative: null,
          fuelLevelAbsolute: null,
        },
        bookingCtx: null,
        pickupOdoByBooking: new Map(),
      });

      expect(result.odometerKm).toBe(12345);
      expect(result.evSoc).toBe(43);
    });

    it('clamps SoC into [0, 100]', () => {
      const above = service.deriveFleetStatusContext({
        vehicle: { id: 'v11', status: VehicleStatus.AVAILABLE },
        state: {
          odometerKm: null,
          evSoc: 142,
          fuelLevelRelative: null,
          fuelLevelAbsolute: null,
        },
        bookingCtx: null,
        pickupOdoByBooking: new Map(),
      });
      const below = service.deriveFleetStatusContext({
        vehicle: { id: 'v12', status: VehicleStatus.AVAILABLE },
        state: {
          odometerKm: null,
          evSoc: -5,
          fuelLevelRelative: null,
          fuelLevelAbsolute: null,
        },
        bookingCtx: null,
        pickupOdoByBooking: new Map(),
      });
      expect(above.evSoc).toBe(100);
      expect(below.evSoc).toBe(0);
    });
  });

  describe('liveKmDriven', () => {
    it('prefers booking.activeKmDriven when already computed', () => {
      const result = service.deriveFleetStatusContext({
        vehicle: { id: 'v20', status: VehicleStatus.RENTED },
        state: { odometerKm: 99999 },
        bookingCtx: { ...BOOKING_WITH_ACTIVE, activeKmDriven: 247 },
        pickupOdoByBooking: new Map([['b-active-1', 10000]]),
      });
      expect(result.liveKmDriven).toBe(247);
    });

    it('derives liveKmDriven from pickupOdo + current odometer when activeKmDriven is null', () => {
      const result = service.deriveFleetStatusContext({
        vehicle: { id: 'v21', status: VehicleStatus.RENTED },
        state: { odometerKm: 10500.9 },
        bookingCtx: { ...BOOKING_WITH_ACTIVE, activeKmDriven: null },
        pickupOdoByBooking: new Map([['b-active-1', 10000]]),
      });
      expect(result.liveKmDriven).toBe(500);
    });

    it('clamps negative odometer delta to 0 (sensor jitter / pickup correction)', () => {
      const result = service.deriveFleetStatusContext({
        vehicle: { id: 'v22', status: VehicleStatus.RENTED },
        state: { odometerKm: 9900 },
        bookingCtx: { ...BOOKING_WITH_ACTIVE, activeKmDriven: null },
        pickupOdoByBooking: new Map([['b-active-1', 10000]]),
      });
      expect(result.liveKmDriven).toBe(0);
    });

    it('returns null when pickup odometer is missing', () => {
      const result = service.deriveFleetStatusContext({
        vehicle: { id: 'v23', status: VehicleStatus.RENTED },
        state: { odometerKm: 10500 },
        bookingCtx: { ...BOOKING_WITH_ACTIVE, activeKmDriven: null },
        pickupOdoByBooking: new Map(),
      });
      expect(result.liveKmDriven).toBeNull();
    });

    it('returns null when current odometer is missing', () => {
      const result = service.deriveFleetStatusContext({
        vehicle: { id: 'v24', status: VehicleStatus.RENTED },
        state: { odometerKm: null },
        bookingCtx: { ...BOOKING_WITH_ACTIVE, activeKmDriven: null },
        pickupOdoByBooking: new Map([['b-active-1', 10000]]),
      });
      expect(result.liveKmDriven).toBeNull();
    });
  });
});
