import { VehicleStatus } from '@prisma/client';
import { VehiclesService } from './vehicles.service';
import { canonicalOperationalStatusToLegacyLabel } from './domain/vehicle-operational-state.serializer';
import type { VehicleStateEngineBookingStateInput } from './domain/vehicle-operational-state.engine.types';

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

const ACTIVE_BOOKING_STATE: VehicleStateEngineBookingStateInput = {
  activeBooking: {
    id: 'b-active-1',
    bookingNumber: '',
    status: 'ACTIVE',
    pickupAt: '2026-07-15T08:00:00.000Z',
    returnAt: '2026-07-20T18:00:00.000Z',
    customerLabel: 'Jane Doe',
    vehicleId: 'v1',
    phase: 'active_rental',
  },
  reservationWindowBooking: null,
  nextBooking: null,
  futureBookingCount: 0,
  dataQualityState: 'RELIABLE',
  dataQualityReasons: [],
};

describe('VehiclesService.deriveFleetStatusContext (delegation)', () => {
  let service: VehiclesService;

  beforeEach(() => {
    service = makeService();
  });

  it('delegates to state engine and returns fleet context from bookingState', () => {
    const result = service.deriveFleetStatusContext({
      vehicle: { id: 'v1', status: VehicleStatus.AVAILABLE },
      state: null,
      bookingState: {
        ...ACTIVE_BOOKING_STATE,
        nextBooking: {
          id: 'b-future-1',
          bookingNumber: 'BK-FUTURE',
          status: 'CONFIRMED',
          pickupAt: '2026-08-01T10:00:00.000Z',
          returnAt: '2026-08-06T18:00:00.000Z',
          customerLabel: 'Future Customer',
          vehicleId: 'v1',
          phase: 'future',
        },
        futureBookingCount: 2,
        futureBookings: [],
      },
      pickupOdoByBooking: new Map(),
    });

    expect(result.status).toBe('Active Rented');
    expect(result.operationalState.status).toBe('ACTIVE_RENTED');
    expect(result.operationalState.reason).toBe('ACTIVE_BOOKING');
    expect(result.status).toBe(
      canonicalOperationalStatusToLegacyLabel(result.operationalState.status),
    );
    expect(result.bookingDto.activeBookingId).toBe('b-active-1');
    expect(result.nextBooking?.bookingNumber).toBe('BK-FUTURE');
    expect(result.futureBookingCount).toBe(2);
  });

  it('logs ghost-state warning via structured guard event for raw RENTED inconsistency', () => {
    const warnSpy = jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation(() => undefined);

    const result = service.deriveFleetStatusContext({
      vehicle: { id: 'v-ghost', status: VehicleStatus.RENTED },
      state: null,
      bookingState: {
        activeBooking: null,
        reservationWindowBooking: null,
        nextBooking: null,
        futureBookingCount: 0,
        futureBookings: [],
        dataQualityState: 'RELIABLE',
        dataQualityReasons: [],
      },
      pickupOdoByBooking: new Map(),
    });

    expect(result.status).toBe('Unknown');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'ghost_legacy_persisted',
        vehicleId: 'v-ghost',
        rawStatus: 'RENTED',
        operationalStatus: 'Unknown',
        reasonCode: 'RAW_STATUS_INCONSISTENT',
      }),
    );
    warnSpy.mockRestore();
  });

  it('logs legacy_raw_unreliable_booking when raw RENTED and booking UNAVAILABLE', () => {
    const warnSpy = jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation(() => undefined);

    const result = service.deriveFleetStatusContext({
      vehicle: { id: 'v-unavail', status: VehicleStatus.RENTED },
      state: null,
      bookingState: {
        activeBooking: null,
        reservationWindowBooking: null,
        nextBooking: null,
        futureBookingCount: 0,
        futureBookings: [],
        dataQualityState: 'UNAVAILABLE',
        dataQualityReasons: ['BOOKING_QUERY_FAILED'],
      },
      pickupOdoByBooking: new Map(),
    });

    expect(result.status).toBe('Unknown');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'legacy_raw_unreliable_booking',
        vehicleId: 'v-unavail',
        reasonCode: 'BOOKING_DATA_UNAVAILABLE',
      }),
    );
    warnSpy.mockRestore();
  });

  it('derives AVAILABLE with nextBooking when only future booking present', () => {
    const result = service.deriveFleetStatusContext({
      vehicle: { id: 'v-future', status: VehicleStatus.AVAILABLE },
      state: null,
      bookingState: {
        activeBooking: null,
        reservationWindowBooking: null,
        nextBooking: {
          id: 'b-future',
          bookingNumber: '',
          status: 'CONFIRMED',
          pickupAt: '2026-08-01T10:00:00.000Z',
          returnAt: '2026-08-06T18:00:00.000Z',
          customerLabel: 'Future',
          vehicleId: 'v-future',
          phase: 'future',
        },
        futureBookingCount: 0,
        dataQualityState: 'RELIABLE',
        dataQualityReasons: [],
      },
      pickupOdoByBooking: new Map(),
    });

    expect(result.status).toBe('Available');
    expect(result.bookingDto).toEqual(
      expect.objectContaining({
        activeBookingId: null,
        reservedBookingId: null,
      }),
    );
  });

  it('fail-closed when bookingState omitted entirely', () => {
    const result = service.deriveFleetStatusContext({
      vehicle: { id: 'v-missing-ctx', status: VehicleStatus.AVAILABLE },
      state: null,
      bookingState: null,
      pickupOdoByBooking: new Map(),
    });

    expect(result.status).toBe('Unknown');
  });

  it('returns UNKNOWN when booking context is UNAVAILABLE', () => {
    const result = service.deriveFleetStatusContext({
      vehicle: { id: 'v-unavail', status: VehicleStatus.AVAILABLE },
      state: null,
      bookingState: {
        activeBooking: null,
        reservationWindowBooking: null,
        nextBooking: null,
        futureBookingCount: 0,
        futureBookings: [],
        dataQualityState: 'UNAVAILABLE',
        dataQualityReasons: ['BOOKING_QUERY_FAILED'],
      },
      pickupOdoByBooking: new Map(),
    });

    expect(result.status).toBe('Unknown');
    expect(result.nextBooking).toBeNull();
    expect(result.futureBookingCount).toBe(0);
  });

  it('exposes EMPTY_BOOKING_CONTEXT on the class for legacy callers', () => {
    expect(VehiclesService.EMPTY_BOOKING_CONTEXT).toBeDefined();
  });
});
