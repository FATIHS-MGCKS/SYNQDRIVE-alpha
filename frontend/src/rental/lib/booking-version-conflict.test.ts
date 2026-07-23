import { describe, expect, it } from 'vitest';
import {
  BookingMutationError,
  handleBookingMutationError,
} from './booking-version-conflict';
import { BOOKING_VERSION_CONFLICT_CODE } from './booking-version-conflict.constants';

describe('booking-version-conflict', () => {
  it('detects version conflict from NestJS error body', () => {
    const err = new BookingMutationError(409, {
      message: 'Booking was modified by another user. Reload and retry.',
      code: BOOKING_VERSION_CONFLICT_CODE,
      current: {
        bookingId: 'bk-1',
        updatedAt: '2026-07-23T10:05:00.000Z',
        status: 'CONFIRMED',
        vehicleId: 'v1',
        customerId: 'c1',
        startDate: '2026-07-24T08:00:00.000Z',
        endDate: '2026-07-26T18:00:00.000Z',
        totalPriceCents: 12000,
      },
    });
    expect(err.isVersionConflict).toBe(true);
    expect(err.current?.bookingId).toBe('bk-1');
  });

  it('handles conflict without closing caller flow', () => {
    let reloaded = false;
    const handled = handleBookingMutationError(
      new BookingMutationError(409, {
        message: 'conflict',
        code: BOOKING_VERSION_CONFLICT_CODE,
        current: { bookingId: 'bk-1', updatedAt: '2026-07-23T10:05:00.000Z' },
      }),
      { onConflictReload: () => { reloaded = true; } },
    );
    expect(handled).toBe(true);
    expect(reloaded).toBe(false);
  });
});
