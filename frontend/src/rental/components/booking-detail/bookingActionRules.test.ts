import { describe, expect, it } from 'vitest';
import { getBookingActionMatrix } from './bookingActionRules';
import type { BookingDetailDto } from '../../../lib/api';

function minimalDetail(overrides: Partial<BookingDetailDto> = {}): BookingDetailDto {
  return {
    core: {
      bookingId: 'bk-1',
      bookingNumber: 'BK-000001',
      status: 'Confirmed',
      statusEnum: 'CONFIRMED',
      startDate: '2026-07-25T08:00:00.000Z',
      endDate: '2026-07-27T08:00:00.000Z',
      pickupStationName: 'Kassel',
      returnStationName: 'Kassel',
    },
    customer: { customerId: 'cust-1', fullName: 'Max Mustermann' },
    vehicle: { vehicleId: 'veh-1', displayName: 'Tesla', licensePlate: 'KS-AB 1', rentalBlocked: false },
    handover: { pickup: null, return: null },
    health: { rentalBlocked: false, blockingReasons: [] },
    documents: { legalTermsAttached: true, legalWithdrawalAttached: true },
    finance: { finalInvoiceStatus: null },
    eligibility: { canStartRental: true, blockingReasons: [] },
    ...overrides,
  } as BookingDetailDto;
}

describe('bookingActionRules no_show', () => {
  it('allows no-show only for confirmed bookings after scheduled pickup', () => {
    const matrix = getBookingActionMatrix(
      minimalDetail({
        core: {
          ...minimalDetail().core,
          startDate: '2020-01-01T08:00:00.000Z',
        },
      }),
    );
    expect(matrix.no_show.allowed).toBe(true);
  });

  it('blocks no-show for pending bookings (backend lifecycle parity)', () => {
    const matrix = getBookingActionMatrix(
      minimalDetail({
        core: {
          ...minimalDetail().core,
          status: 'Pending',
          statusEnum: 'PENDING',
          startDate: '2020-01-01T08:00:00.000Z',
        },
      }),
    );
    expect(matrix.no_show.allowed).toBe(false);
  });

  it('blocks no-show before scheduled pickup time', () => {
    const matrix = getBookingActionMatrix(
      minimalDetail({
        core: {
          ...minimalDetail().core,
          startDate: '2099-01-01T08:00:00.000Z',
        },
      }),
    );
    expect(matrix.no_show.allowed).toBe(false);
    expect(matrix.no_show.reason).toMatch(/Abholzeitpunkt/i);
  });
});
