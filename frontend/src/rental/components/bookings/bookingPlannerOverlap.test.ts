import { describe, expect, it, vi } from 'vitest';
import type { BookingUiRow } from '../entityMappers';
import {
  bookingOverlapsHalfOpenWindow,
  clipBookingToHalfOpenWindow,
} from './bookingPlannerOverlap';

function row(id: string, start: string, end: string): BookingUiRow {
  return {
    id,
    customer: 'Test',
    vehicle: 'V',
    plate: 'X',
    status: 'confirmed',
    vehicleId: 'veh-1',
    _raw: { startDate: start, endDate: end },
  } as BookingUiRow;
}

describe('bookingPlannerOverlap', () => {
  it('does not duplicate adjacent bookings at exact boundary', () => {
    const windowStart = new Date('2026-07-10T08:00:00.000Z');
    const windowEnd = new Date('2026-07-12T08:00:00.000Z');
    const ending = row('a', '2026-07-09T08:00:00.000Z', '2026-07-10T08:00:00.000Z');
    const starting = row('b', '2026-07-10T08:00:00.000Z', '2026-07-11T08:00:00.000Z');
    expect(bookingOverlapsHalfOpenWindow(ending, windowStart, windowEnd)).toBe(false);
    expect(bookingOverlapsHalfOpenWindow(starting, windowStart, windowEnd)).toBe(true);
  });

  it('clips timeline bar with half-open window end', () => {
    const clip = clipBookingToHalfOpenWindow(
      new Date('2026-07-10T08:00:00.000Z'),
      new Date('2026-07-12T08:00:00.000Z'),
      new Date('2026-07-11T08:00:00.000Z'),
      new Date('2026-07-13T08:00:00.000Z'),
    );
    expect(clip).toEqual({
      clipStart: new Date('2026-07-11T08:00:00.000Z').getTime(),
      clipEnd: new Date('2026-07-12T08:00:00.000Z').getTime(),
    });
  });

  it('returns null when booking ends exactly at window start', () => {
    const clip = clipBookingToHalfOpenWindow(
      new Date('2026-07-09T08:00:00.000Z'),
      new Date('2026-07-10T08:00:00.000Z'),
      new Date('2026-07-10T08:00:00.000Z'),
      new Date('2026-07-12T08:00:00.000Z'),
    );
    expect(clip).toBeNull();
  });
});

describe('calendar booking chip pointer isolation', () => {
  it('stops pointer propagation from booking chip handler', () => {
    const onBookingClick = vi.fn();
    const onDayClick = vi.fn();
    const stopPropagation = vi.fn();
    const preventDefault = vi.fn();

    const bookingHandler = (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onBookingClick('b1');
    };
    const dayHandler = () => onDayClick(5);

    bookingHandler({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalled();
    expect(onBookingClick).toHaveBeenCalledWith('b1');
    expect(onDayClick).not.toHaveBeenCalled();

    dayHandler();
    expect(onDayClick).toHaveBeenCalledWith(5);
  });
});
