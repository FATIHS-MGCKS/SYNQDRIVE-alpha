import { overlapsHalfOpen } from '../../../lib/datetime';
import type { BookingUiRow } from '../../lib/entityMappers';
import { bookingEndIso, bookingStartIso, parseIso } from './bookingUtils';

/** Half-open overlap of booking `[start, end)` with planner window `[windowStart, windowEnd)`. */
export function bookingOverlapsHalfOpenWindow(
  row: BookingUiRow,
  windowStart: Date,
  windowEnd: Date,
): boolean {
  const start = parseIso(bookingStartIso(row));
  const end = parseIso(bookingEndIso(row));
  if (!start || !end) return false;
  return overlapsHalfOpen(start, end, windowStart, windowEnd);
}

/** Clip booking to half-open window; returns null when no visible segment remains. */
export function clipBookingToHalfOpenWindow(
  start: Date,
  end: Date,
  windowStart: Date,
  windowEnd: Date,
): { clipStart: number; clipEnd: number } | null {
  const clipStart = Math.max(start.getTime(), windowStart.getTime());
  const clipEnd = Math.min(end.getTime(), windowEnd.getTime());
  if (clipEnd <= clipStart) return null;
  return { clipStart, clipEnd };
}

/** Map bookings to org calendar days without duplicate ids per day. */
export function mapBookingsToOrgDays(
  rows: BookingUiRow[],
  daySlices: Array<{ day: number; start: Date; end: Date }>,
): Map<number, BookingUiRow[]> {
  const map = new Map<number, BookingUiRow[]>();
  for (const slice of daySlices) {
    const seen = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      if (!bookingOverlapsHalfOpenWindow(row, slice.start, slice.end)) continue;
      seen.add(row.id);
      const list = map.get(slice.day) ?? [];
      list.push(row);
      map.set(slice.day, list);
    }
  }
  return map;
}
