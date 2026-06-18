import { describe, expect, it } from 'vitest';
import type { BookingUiStatus } from '../components/bookings/bookingStatus';
import {
  calculateFreeSlots,
  calculateUtilization,
  calculateVisibleBookedIntervals,
  clampBookingToRange,
  getNextBooking,
  getNextFreeSlot,
  type AvailabilityBookingInput,
  type AvailabilityRange,
} from './vehicle-availability-intelligence.utils';

const MS_HOUR = 60 * 60 * 1000;
const MS_DAY = 24 * MS_HOUR;

function range(start: string, end: string): AvailabilityRange {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return {
    start: startDate,
    end: endDate,
    totalMs: endDate.getTime() - startDate.getTime(),
  };
}

function booking(
  id: string,
  status: BookingUiStatus,
  start: string,
  end: string,
): AvailabilityBookingInput {
  return {
    id,
    status,
    startDate: new Date(start),
    endDate: new Date(end),
  };
}

describe('vehicle-availability-intelligence.utils', () => {
  const visibleRange = range('2026-06-01T00:00:00.000Z', '2026-06-30T23:59:59.999Z');

  it('returns no intervals when there are no bookings', () => {
    expect(calculateVisibleBookedIntervals([], visibleRange)).toEqual([]);
    const util = calculateUtilization([], visibleRange);
    expect(util.occupancyPct).toBe(0);
    expect(util.freeDays).toBeGreaterThan(0);
    expect(getNextFreeSlot([], visibleRange, Date.parse('2026-06-10T12:00:00.000Z'))).not.toBeNull();
    expect(getNextBooking([], visibleRange)).toBeNull();
  });

  it('handles one booking inside the range', () => {
    const bookings = [booking('b1', 'confirmed', '2026-06-05T10:00:00.000Z', '2026-06-08T10:00:00.000Z')];
    const intervals = calculateVisibleBookedIntervals(bookings, visibleRange);
    expect(intervals).toHaveLength(1);
    expect(intervals[0]!.startMs).toBe(Date.parse('2026-06-05T10:00:00.000Z'));
    expect(intervals[0]!.endMs).toBe(Date.parse('2026-06-08T10:00:00.000Z'));
    expect(calculateUtilization(bookings, visibleRange).occupancyPct).toBeGreaterThan(0);
  });

  it('clamps a booking that starts before the range', () => {
    const bookings = [booking('b1', 'active', '2026-05-28T10:00:00.000Z', '2026-06-04T10:00:00.000Z')];
    const clamped = clampBookingToRange(bookings[0]!, visibleRange);
    expect(clamped?.startMs).toBe(visibleRange.start.getTime());
    expect(clamped?.endMs).toBe(Date.parse('2026-06-04T10:00:00.000Z'));
  });

  it('clamps a booking that ends after the range', () => {
    const bookings = [booking('b1', 'confirmed', '2026-06-28T10:00:00.000Z', '2026-07-05T10:00:00.000Z')];
    const clamped = clampBookingToRange(bookings[0]!, visibleRange);
    expect(clamped?.startMs).toBe(Date.parse('2026-06-28T10:00:00.000Z'));
    expect(clamped?.endMs).toBe(visibleRange.end.getTime());
  });

  it('merges overlapping bookings', () => {
    const bookings = [
      booking('b1', 'confirmed', '2026-06-05T10:00:00.000Z', '2026-06-10T10:00:00.000Z'),
      booking('b2', 'pending', '2026-06-08T10:00:00.000Z', '2026-06-12T10:00:00.000Z'),
    ];
    const intervals = calculateVisibleBookedIntervals(bookings, visibleRange);
    expect(intervals).toHaveLength(1);
    expect(intervals[0]!.startMs).toBe(Date.parse('2026-06-05T10:00:00.000Z'));
    expect(intervals[0]!.endMs).toBe(Date.parse('2026-06-12T10:00:00.000Z'));
  });

  it('ignores cancelled and no-show bookings', () => {
    const bookings = [
      booking('b1', 'cancelled', '2026-06-05T10:00:00.000Z', '2026-06-10T10:00:00.000Z'),
      booking('b2', 'no_show', '2026-06-12T10:00:00.000Z', '2026-06-15T10:00:00.000Z'),
      booking('b3', 'confirmed', '2026-06-20T10:00:00.000Z', '2026-06-22T10:00:00.000Z'),
    ];
    const intervals = calculateVisibleBookedIntervals(bookings, visibleRange);
    expect(intervals).toHaveLength(1);
    expect(intervals[0]!.startMs).toBe(Date.parse('2026-06-20T10:00:00.000Z'));
  });

  it('separates forecast and realized utilization', () => {
    const bookings = [
      booking('b1', 'completed', '2026-06-01T10:00:00.000Z', '2026-06-05T10:00:00.000Z'),
      booking('b2', 'confirmed', '2026-06-20T10:00:00.000Z', '2026-06-25T10:00:00.000Z'),
    ];
    const util = calculateUtilization(bookings, visibleRange);
    expect(util.realizedPct).toBeGreaterThan(0);
    expect(util.forecastPct).toBeGreaterThan(0);
    expect(util.occupancyPct).toBeGreaterThanOrEqual(Math.max(util.realizedPct, util.forecastPct));
  });

  it('includes active bookings in forecast utilization', () => {
    const now = Date.parse('2026-06-10T12:00:00.000Z');
    const bookings = [booking('b1', 'active', '2026-06-08T10:00:00.000Z', '2026-06-15T10:00:00.000Z')];
    const util = calculateUtilization(bookings, visibleRange);
    expect(util.forecastPct).toBeGreaterThan(0);
    expect(getNextBooking(bookings, visibleRange, now)?.id).toBe('b1');
  });

  it('detects free slots and the next free slot in a 30-day range', () => {
    const thirtyDayRange = range('2026-06-01T00:00:00.000Z', '2026-06-30T23:59:59.999Z');
    const bookings = [
      booking('b1', 'completed', '2026-06-01T10:00:00.000Z', '2026-06-05T10:00:00.000Z'),
      booking('b2', 'confirmed', '2026-06-12T10:00:00.000Z', '2026-06-15T10:00:00.000Z'),
    ];
    const slots = calculateFreeSlots(bookings, thirtyDayRange, { minGapMs: MS_DAY });
    expect(slots.length).toBeGreaterThanOrEqual(2);

    const next = getNextFreeSlot(
      bookings,
      thirtyDayRange,
      Date.parse('2026-06-06T12:00:00.000Z'),
      { minGapMs: MS_DAY },
    );
    expect(next).not.toBeNull();
    expect(next!.startMs).toBeGreaterThanOrEqual(Date.parse('2026-06-06T12:00:00.000Z'));
    expect(next!.endMs).toBeLessThanOrEqual(Date.parse('2026-06-12T10:00:00.000Z'));
  });
});
