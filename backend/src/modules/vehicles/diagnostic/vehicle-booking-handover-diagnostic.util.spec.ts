import {
  buildDiagnosticBookingContext,
  isCanonicalPickupReservationDay,
  isLegacyReservationWindowBooking,
  wouldCanonicalLogicReserveBooking,
  wouldLegacyLogicReserveBooking,
} from './vehicle-booking-handover-diagnostic.util';

const NOW = new Date('2026-06-24T10:00:00.000Z');

describe('vehicle-booking-handover-diagnostic.util', () => {
  const futureBooking = {
    id: 'bk-future',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    status: 'CONFIRMED' as const,
    startDate: new Date('2026-07-10T08:00:00.000Z'),
    endDate: new Date('2026-07-12T08:00:00.000Z'),
    completedAt: null,
    cancelledAt: null,
    createdAt: new Date('2026-06-20T08:00:00.000Z'),
  };

  const todayPickupBooking = {
    ...futureBooking,
    id: 'bk-today',
    startDate: new Date('2026-06-24T08:00:00.000Z'),
    endDate: new Date('2026-06-26T08:00:00.000Z'),
  };

  it('detects legacy reservation window for future CONFIRMED booking', () => {
    expect(isLegacyReservationWindowBooking(futureBooking, NOW)).toBe(true);
    expect(wouldLegacyLogicReserveBooking(futureBooking, NOW)).toBe(true);
  });

  it('does not treat future pickup day as canonical reservation day', () => {
    expect(isCanonicalPickupReservationDay(futureBooking, NOW, 'Europe/Berlin')).toBe(false);
    expect(wouldCanonicalLogicReserveBooking(futureBooking, NOW, 'Europe/Berlin')).toBe(false);
  });

  it('treats same-day pickup as canonical reservation day', () => {
    expect(isCanonicalPickupReservationDay(todayPickupBooking, NOW, 'Europe/Berlin')).toBe(true);
    expect(wouldCanonicalLogicReserveBooking(todayPickupBooking, NOW, 'Europe/Berlin')).toBe(true);
  });

  it('buildDiagnosticBookingContext prefers ACTIVE over reserved slot for derivation', () => {
    const ctx = buildDiagnosticBookingContext(
      [
        todayPickupBooking,
        {
          ...todayPickupBooking,
          id: 'bk-active',
          status: 'ACTIVE',
        },
      ],
      NOW,
    );
    expect(ctx.activeBookingId).toBe('bk-active');
    expect(ctx.reservedBookingId).toBe('bk-today');
  });
});
