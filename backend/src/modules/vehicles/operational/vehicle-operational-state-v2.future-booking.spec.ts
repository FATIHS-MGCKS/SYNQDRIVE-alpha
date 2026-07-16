import {
  buildDiagnosticBookingContext,
  isCanonicalPickupReservationDay,
  isLegacyReservationWindowBooking,
  wouldCanonicalLogicReserveBooking,
} from '../diagnostic/vehicle-booking-handover-diagnostic.util';
import { VehiclesService } from '../vehicles.service';
import {
  buildFutureBookingSupplement,
  makeBookingRow,
  makeOperationalPrismaMocks,
  makeOperationalVehiclesService,
} from './vehicle-operational-state-v2.test-helpers';

const NOW = new Date('2026-06-24T10:00:00.000Z');

describe('Vehicle Operational State V2 — future booking supplement', () => {
  const futureStart = new Date('2026-07-08T08:00:00.000Z');
  const futureEnd = new Date('2026-07-12T08:00:00.000Z');

  const futureBooking = {
    id: 'bk-future',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    status: 'CONFIRMED' as const,
    startDate: futureStart,
    endDate: futureEnd,
    completedAt: null,
    cancelledAt: null,
    createdAt: new Date('2026-06-20T08:00:00.000Z'),
  };

  it('canonical V2: booking two weeks ahead is not a reservation day yet', () => {
    expect(wouldCanonicalLogicReserveBooking(futureBooking, NOW, 'Europe/Berlin')).toBe(
      false,
    );
    expect(isCanonicalPickupReservationDay(futureBooking, NOW, 'Europe/Berlin')).toBe(
      false,
    );
  });

  it('legacy diagnostic helper still documents old reserved slot (diagnostic only)', () => {
    expect(isLegacyReservationWindowBooking(futureBooking, NOW)).toBe(true);
    const ctx = buildDiagnosticBookingContext([futureBooking], NOW);
    expect(ctx.reservedBookingId).toBe('bk-future');
  });

  it('deriveFleetStatusContext with legacy booking ctx surfaces Reserved when ctx says so', () => {
    const service = makeOperationalVehiclesService();
    const legacyCtx = buildDiagnosticBookingContext([futureBooking], NOW);
    const result = service.deriveFleetStatusContext({
      vehicle: { id: 'veh-1', status: 'AVAILABLE' },
      state: null,
      bookingCtx: legacyCtx,
      pickupOdoByBooking: new Map(),
    });
    expect(result.status).toBe('Reserved');
  });

  it('canonical target: Available when only future booking and no reserved ctx', () => {
    const service = makeOperationalVehiclesService();
    const result = service.deriveFleetStatusContext({
      vehicle: { id: 'veh-1', status: 'AVAILABLE' },
      state: null,
      bookingCtx: VehiclesService.EMPTY_BOOKING_CONTEXT,
      pickupOdoByBooking: new Map(),
    });
    expect(result.status).toBe('Available');
  });

  it('computes nextBooking and futureBookingCount for multiple future bookings', () => {
    const second = {
      ...futureBooking,
      id: 'bk-future-2',
      startDate: new Date('2026-07-20T08:00:00.000Z'),
      endDate: new Date('2026-07-22T08:00:00.000Z'),
    };
    const supplement = buildFutureBookingSupplement(
      [second, futureBooking],
      NOW,
    );
    expect(supplement.nextBookingId).toBe('bk-future');
    expect(supplement.futureBookingCount).toBe(2);
  });

  it('excludes cancelled future bookings from nextBooking supplement', () => {
    const cancelled = {
      ...futureBooking,
      id: 'bk-cancelled',
      cancelledAt: new Date('2026-06-23T08:00:00.000Z'),
    };
    const supplement = buildFutureBookingSupplement([cancelled], NOW);
    expect(supplement.nextBookingId).toBeNull();
    expect(supplement.futureBookingCount).toBe(0);
  });
});

describe('Vehicle Operational State V2 — buildBookingContextMap future rows', () => {
  const futureStart = new Date('2026-08-01T08:00:00.000Z');
  const futureEnd = new Date('2026-08-06T08:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps future CONFIRMED in nextBooking supplement, not reserved slot (Fall A)', async () => {
    const bookingFindMany = jest.fn().mockResolvedValue([
      makeBookingRow({
        id: 'bk-future',
        startDate: futureStart,
        endDate: futureEnd,
      }),
    ]);
    const stationFindMany = jest
      .fn()
      .mockResolvedValue([{ id: 'st-1', name: 'Kassel' }]);

    const service = makeOperationalVehiclesService({
      prisma: makeOperationalPrismaMocks({
        booking: { findMany: bookingFindMany },
        station: { findMany: stationFindMany },
      }),
    });

    const bundle = await (service as any).buildBookingContextMap('org-1', ['veh-1']);
    expect(bundle.map.get('veh-1')).toBeUndefined();
    expect(bundle.supplements.get('veh-1')?.nextBookingId).toBe('bk-future');
    expect(bundle.supplements.get('veh-1')?.futureBookingCount).toBe(1);
  });
});
