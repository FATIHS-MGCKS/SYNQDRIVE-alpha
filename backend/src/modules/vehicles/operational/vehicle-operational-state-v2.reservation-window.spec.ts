import {
  buildDiagnosticBookingContext,
  isCanonicalPickupReservationDay,
} from '../diagnostic/vehicle-booking-handover-diagnostic.util';
import {
  makeBookingRow,
  makeOperationalVehiclesService,
} from './vehicle-operational-state-v2.test-helpers';

describe('Vehicle Operational State V2 — reservation window', () => {
  const tz = 'Europe/Berlin';

  const bookingBase = {
    id: 'bk-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    status: 'CONFIRMED' as const,
    completedAt: null,
    cancelledAt: null,
    createdAt: new Date('2026-06-01T08:00:00.000Z'),
  };

  it('starts Reserved on pickup calendar day in organization timezone', () => {
    const now = new Date('2026-07-10T06:00:00.000Z'); // 08:00 Berlin summer
    const booking = {
      ...bookingBase,
      startDate: new Date('2026-07-10T06:00:00.000Z'),
      endDate: new Date('2026-07-12T08:00:00.000Z'),
    };
    expect(isCanonicalPickupReservationDay(booking, now, tz)).toBe(true);
    const ctx = buildDiagnosticBookingContext([booking], now);
    expect(ctx.reservedBookingId).toBe('bk-1');
  });

  it('is not Reserved the day before pickup (shortly before local midnight)', () => {
    const now = new Date('2026-07-09T21:30:00.000Z'); // 23:30 Berlin
    const booking = {
      ...bookingBase,
      startDate: new Date('2026-07-10T06:00:00.000Z'),
      endDate: new Date('2026-07-12T08:00:00.000Z'),
    };
    expect(isCanonicalPickupReservationDay(booking, now, tz)).toBe(false);
  });

  it('handles DST spring-forward pickup day boundary', () => {
    // 2026-03-29 Europe/Berlin DST starts
    const now = new Date('2026-03-29T05:30:00.000Z');
    const booking = {
      ...bookingBase,
      startDate: new Date('2026-03-29T07:00:00.000Z'),
      endDate: new Date('2026-03-31T08:00:00.000Z'),
    };
    expect(isCanonicalPickupReservationDay(booking, now, tz)).toBe(true);
  });

  it('flags no-show when pickup time passed but booking still CONFIRMED', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-10T12:00:00.000Z'));

    const bookingFindMany = jest.fn().mockResolvedValue([
      makeBookingRow({
        status: 'CONFIRMED',
        startDate: new Date('2026-07-10T08:00:00.000Z'),
        endDate: new Date('2026-07-12T08:00:00.000Z'),
      }),
    ]);
    const service = makeOperationalVehiclesService({
      prisma: {
        booking: { findMany: bookingFindMany },
        station: { findMany: jest.fn().mockResolvedValue([{ id: 'st-1', name: 'Kassel' }]) },
      },
    });

    const map = await (service as any).buildBookingContextMap('org-1', ['veh-1']);
    expect(map.get('veh-1')?.reservedIsOverdue).toBe(true);
    jest.useRealTimers();
  });

  it('does not load CANCELLED bookings into reservation window', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-10T10:00:00.000Z'));

    const bookingFindMany = jest.fn().mockResolvedValue([]);
    const service = makeOperationalVehiclesService({
      prisma: { booking: { findMany: bookingFindMany }, station: { findMany: jest.fn() } },
    });
    await (service as any).buildBookingContextMap('org-1', ['veh-1']);
    expect(bookingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          vehicleId: { in: ['veh-1'] },
        }),
      }),
    );
    jest.useRealTimers();
  });

  it('keeps earliest reservation when multiple CONFIRMED overlap the window', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-10T10:00:00.000Z'));

    const bookingFindMany = jest.fn().mockResolvedValue([
      makeBookingRow({
        id: 'bk-earlier',
        startDate: new Date('2026-07-10T08:00:00.000Z'),
        endDate: new Date('2026-07-11T08:00:00.000Z'),
      }),
      makeBookingRow({
        id: 'bk-later',
        startDate: new Date('2026-07-11T09:00:00.000Z'),
        endDate: new Date('2026-07-13T08:00:00.000Z'),
      }),
    ]);
    const service = makeOperationalVehiclesService({
      prisma: {
        booking: { findMany: bookingFindMany },
        station: { findMany: jest.fn().mockResolvedValue([{ id: 'st-1', name: 'Kassel' }]) },
      },
    });
    const map = await (service as any).buildBookingContextMap('org-1', ['veh-1']);
    expect(map.get('veh-1')?.reservedBookingId).toBe('bk-earlier');
    jest.useRealTimers();
  });
});
