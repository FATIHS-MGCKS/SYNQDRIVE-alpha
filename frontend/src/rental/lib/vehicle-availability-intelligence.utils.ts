import type { BookingUiStatus } from '../components/bookings/bookingStatus';

const MS_HOUR = 60 * 60 * 1000;
const MS_DAY = 24 * MS_HOUR;

export const AVAILABILITY_NON_OCCUPANCY: BookingUiStatus[] = ['cancelled', 'no_show'];
export const AVAILABILITY_FORECAST_STATUSES: BookingUiStatus[] = ['pending', 'confirmed', 'active'];
export const AVAILABILITY_REALIZED_STATUSES: BookingUiStatus[] = ['completed'];
export const AVAILABILITY_OCCUPANCY_STATUSES: BookingUiStatus[] = [
  ...AVAILABILITY_FORECAST_STATUSES,
  ...AVAILABILITY_REALIZED_STATUSES,
];

export interface AvailabilityRange {
  start: Date;
  end: Date;
  totalMs?: number;
}

export interface AvailabilityBookingInput {
  id: string;
  status: BookingUiStatus;
  startDate: Date;
  endDate: Date;
  customerName?: string;
}

export interface ClampedInterval {
  startMs: number;
  endMs: number;
}

export interface BookedInterval extends ClampedInterval {
  start: Date;
  end: Date;
}

export interface FreeSlot extends ClampedInterval {
  start: Date;
  end: Date;
  durationMs: number;
}

export interface UtilizationBreakdown {
  rangeMs: number;
  bookedMs: number;
  freeMs: number;
  forecastMs: number;
  realizedMs: number;
  occupancyPct: number;
  forecastPct: number;
  realizedPct: number;
  freeDays: number;
  freeHours: number;
}

export function isOccupancyStatus(status: BookingUiStatus): boolean {
  return AVAILABILITY_OCCUPANCY_STATUSES.includes(status);
}

export function resolveMinGapMs(range: AvailabilityRange): number {
  const rangeMs = range.totalMs ?? Math.max(1, range.end.getTime() - range.start.getTime());
  const dayCount = Math.max(1, Math.round(rangeMs / MS_DAY));
  return dayCount <= 14 ? 6 * MS_HOUR : MS_DAY;
}

export function clampBookingToRange(
  booking: AvailabilityBookingInput,
  range: AvailabilityRange,
): ClampedInterval | null {
  const rangeStart = range.start.getTime();
  const rangeEnd = range.end.getTime();
  const startMs = Math.max(booking.startDate.getTime(), rangeStart);
  const endMs = Math.min(booking.endDate.getTime(), rangeEnd);
  if (endMs <= startMs) return null;
  return { startMs, endMs };
}

export function mergeBookedIntervals(intervals: ClampedInterval[]): BookedInterval[] {
  if (intervals.length === 0) return [];

  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs);
  const merged: ClampedInterval[] = [];
  let current = { ...sorted[0]! };

  for (let i = 1; i < sorted.length; i += 1) {
    const next = sorted[i]!;
    if (next.startMs <= current.endMs) {
      current.endMs = Math.max(current.endMs, next.endMs);
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);

  return merged.map((iv) => ({
    ...iv,
    start: new Date(iv.startMs),
    end: new Date(iv.endMs),
  }));
}

export function calculateVisibleBookedIntervals(
  bookings: AvailabilityBookingInput[],
  range: AvailabilityRange,
  statuses: BookingUiStatus[] = AVAILABILITY_OCCUPANCY_STATUSES,
): BookedInterval[] {
  const clamped = bookings
    .filter((b) => statuses.includes(b.status))
    .map((b) => clampBookingToRange(b, range))
    .filter((iv): iv is ClampedInterval => iv != null);

  return mergeBookedIntervals(clamped);
}

export function sumBookedMs(intervals: ClampedInterval[]): number {
  return intervals.reduce((sum, iv) => sum + (iv.endMs - iv.startMs), 0);
}

function toFreeSlot(startMs: number, endMs: number): FreeSlot {
  return {
    startMs,
    endMs,
    start: new Date(startMs),
    end: new Date(endMs),
    durationMs: endMs - startMs,
  };
}

export function calculateFreeSlots(
  bookings: AvailabilityBookingInput[],
  range: AvailabilityRange,
  options?: { minGapMs?: number; statuses?: BookingUiStatus[] },
): FreeSlot[] {
  const rangeStart = range.start.getTime();
  const rangeEnd = range.end.getTime();
  const minGapMs = options?.minGapMs ?? resolveMinGapMs(range);
  const booked = calculateVisibleBookedIntervals(bookings, range, options?.statuses);

  const slots: FreeSlot[] = [];
  let cursor = rangeStart;

  for (const interval of booked) {
    if (interval.startMs > cursor) {
      const durationMs = interval.startMs - cursor;
      if (durationMs >= minGapMs) {
        slots.push(toFreeSlot(cursor, interval.startMs));
      }
    }
    cursor = Math.max(cursor, interval.endMs);
  }

  if (rangeEnd > cursor) {
    const durationMs = rangeEnd - cursor;
    if (durationMs >= minGapMs) {
      slots.push(toFreeSlot(cursor, rangeEnd));
    }
  }

  return slots;
}

function pct(partMs: number, totalMs: number): number {
  if (totalMs <= 0) return 0;
  return Math.min(100, Math.round((partMs / totalMs) * 100));
}

export function splitFreeDuration(freeMs: number): { freeDays: number; freeHours: number } {
  if (freeMs <= 0) return { freeDays: 0, freeHours: 0 };
  const freeDays = Math.floor(freeMs / MS_DAY);
  const remainderMs = freeMs - freeDays * MS_DAY;
  const freeHours = Math.round(remainderMs / MS_HOUR);
  return { freeDays, freeHours };
}

export function formatFreeDurationLabel(freeDays: number, freeHours: number): string {
  if (freeDays > 0 && freeHours > 0) {
    return `${freeDays} ${freeDays === 1 ? 'Tag' : 'Tage'} · ${freeHours} Std.`;
  }
  if (freeDays > 0) {
    return `${freeDays} ${freeDays === 1 ? 'Tag' : 'Tage'}`;
  }
  if (freeHours > 0) {
    return `${freeHours} Std.`;
  }
  return '0 Std.';
}

export function formatSlotDurationLabel(durationMs: number): string {
  if (durationMs >= MS_DAY) {
    const days = Math.round(durationMs / MS_DAY);
    return `${days} ${days === 1 ? 'Tag' : 'Tage'}`;
  }
  const hours = Math.max(1, Math.round(durationMs / MS_HOUR));
  return `${hours} Std.`;
}

export function calculateUtilization(
  bookings: AvailabilityBookingInput[],
  range: AvailabilityRange,
): UtilizationBreakdown {
  const rangeMs = Math.max(1, range.totalMs ?? range.end.getTime() - range.start.getTime());

  const occupancyIntervals = calculateVisibleBookedIntervals(
    bookings,
    range,
    AVAILABILITY_OCCUPANCY_STATUSES,
  );
  const forecastIntervals = calculateVisibleBookedIntervals(
    bookings,
    range,
    AVAILABILITY_FORECAST_STATUSES,
  );
  const realizedIntervals = calculateVisibleBookedIntervals(
    bookings,
    range,
    AVAILABILITY_REALIZED_STATUSES,
  );

  const bookedMs = sumBookedMs(occupancyIntervals);
  const forecastMs = sumBookedMs(forecastIntervals);
  const realizedMs = sumBookedMs(realizedIntervals);
  const freeMs = Math.max(0, rangeMs - bookedMs);
  const { freeDays, freeHours } = splitFreeDuration(freeMs);

  return {
    rangeMs,
    bookedMs,
    freeMs,
    forecastMs,
    realizedMs,
    occupancyPct: pct(bookedMs, rangeMs),
    forecastPct: pct(forecastMs, rangeMs),
    realizedPct: pct(realizedMs, rangeMs),
    freeDays,
    freeHours,
  };
}

export function getNextFreeSlot(
  bookings: AvailabilityBookingInput[],
  range: AvailabilityRange,
  now = Date.now(),
  options?: { minGapMs?: number },
): FreeSlot | null {
  const anchor = Math.max(now, range.start.getTime());
  const rangeEnd = range.end.getTime();
  if (anchor >= rangeEnd) return null;

  const slots = calculateFreeSlots(bookings, range, options);
  for (const slot of slots) {
    if (slot.endMs <= anchor) continue;
    const effectiveStart = Math.max(slot.startMs, anchor);
    const durationMs = slot.endMs - effectiveStart;
    const minGapMs = options?.minGapMs ?? resolveMinGapMs(range);
    if (durationMs < minGapMs) continue;
    return toFreeSlot(effectiveStart, slot.endMs);
  }
  return null;
}

export function getNextBooking(
  bookings: AvailabilityBookingInput[],
  range: AvailabilityRange,
  now = Date.now(),
): AvailabilityBookingInput | null {
  return (
    bookings
      .filter((b) => isOccupancyStatus(b.status))
      .filter((b) => b.endDate.getTime() > now)
      .filter((b) => clampBookingToRange(b, range) != null)
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0] ?? null
  );
}
