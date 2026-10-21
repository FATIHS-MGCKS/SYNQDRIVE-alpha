import { describe, expect, it } from 'vitest';
import type { BookingUiRow } from '../components/bookings/bookingTypes';
import { hasBookingWindowConflict } from './booking-window-conflict';

function row(overrides: Partial<BookingUiRow> & { id: string; vehicleId: string }): BookingUiRow {
  return {
    id: overrides.id,
    vehicleId: overrides.vehicleId,
    customer: 'Customer',
    vehicle: 'VW Golf',
    plate: 'B-1',
    status: overrides.status ?? 'confirmed',
    startDate: overrides.startDate ?? '10 Mar 2026',
    endDate: overrides.endDate ?? '12 Mar 2026',
    startTime: '10:00',
    endTime: '10:00',
    pickupLocation: 'Berlin',
    returnLocation: 'Berlin',
    revenue: 100,
    days: [10, 11, 12],
    startDay: 10,
    endDay: 12,
    startMonth: 2,
    endMonth: 2,
    startYear: 2026,
    endYear: 2026,
    _raw: {
      startDate: overrides._raw?.startDate ?? '2026-03-10T10:00:00.000Z',
      endDate: overrides._raw?.endDate ?? '2026-03-12T10:00:00.000Z',
      statusEnum: overrides._raw?.statusEnum ?? 'CONFIRMED',
    },
    ...overrides,
  };
}

describe('booking-window-conflict', () => {
  it('detects overlap via bookingsForVehicleInRange authority', () => {
    const bookings = [
      row({
        id: 'b-1',
        vehicleId: 'v-1',
        _raw: {
          startDate: '2026-03-10T10:00:00.000Z',
          endDate: '2026-03-12T10:00:00.000Z',
          statusEnum: 'CONFIRMED',
        },
      }),
    ];
    expect(
      hasBookingWindowConflict({
        vehicleId: 'v-1',
        pickupAt: '2026-03-11T09:00:00.000Z',
        returnAt: '2026-03-13T09:00:00.000Z',
        bookings,
      }),
    ).toBe(true);
  });

  it('excludes the booking being edited', () => {
    const bookings = [
      row({
        id: 'b-edit',
        vehicleId: 'v-1',
        _raw: {
          startDate: '2026-03-10T10:00:00.000Z',
          endDate: '2026-03-12T10:00:00.000Z',
          statusEnum: 'CONFIRMED',
        },
      }),
    ];
    expect(
      hasBookingWindowConflict({
        vehicleId: 'v-1',
        pickupAt: '2026-03-10T10:00:00.000Z',
        returnAt: '2026-03-12T10:00:00.000Z',
        bookings,
        excludeBookingId: 'b-edit',
      }),
    ).toBe(false);
  });

  it('ignores cancelled bookings', () => {
    const bookings = [
      row({
        id: 'b-cancel',
        vehicleId: 'v-1',
        status: 'cancelled',
        _raw: {
          startDate: '2026-03-10T10:00:00.000Z',
          endDate: '2026-03-12T10:00:00.000Z',
          statusEnum: 'CANCELLED',
        },
      }),
    ];
    expect(
      hasBookingWindowConflict({
        vehicleId: 'v-1',
        pickupAt: '2026-03-10T10:00:00.000Z',
        returnAt: '2026-03-12T10:00:00.000Z',
        bookings,
      }),
    ).toBe(false);
  });
});
