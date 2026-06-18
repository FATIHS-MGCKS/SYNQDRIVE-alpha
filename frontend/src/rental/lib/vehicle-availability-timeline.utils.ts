import type { BookingUiStatus } from '../components/bookings/bookingStatus';
import {
  calculateFreeSlots,
  formatSlotDurationLabel,
  type AvailabilityBookingInput,
} from './vehicle-availability-intelligence.utils';

export type TimelineRangePreset = 7 | 14 | 30 | 90;
export type TimelineRangeMode = TimelineRangePreset | 'history';

export const TIMELINE_RANGE_PRESETS: { id: TimelineRangeMode; label: string; days: number }[] = [
  { id: 7, label: '7 Tage', days: 7 },
  { id: 14, label: '14 Tage', days: 14 },
  { id: 30, label: '30 Tage', days: 30 },
  { id: 90, label: '90 Tage', days: 90 },
  { id: 'history', label: 'Historie', days: 30 },
];

const MS_HOUR = 60 * 60 * 1000;
const MS_DAY = 24 * MS_HOUR;

export interface TimelineBookingInput {
  id: string;
  customerName: string;
  status: BookingUiStatus;
  startDate: Date;
  endDate: Date;
  pickupLocation: string;
  returnLocation: string;
}

export interface TimelineHorizon {
  start: Date;
  end: Date;
  fromIso: string;
  toIso: string;
  totalMs: number;
  dayCount: number;
  columns: { date: Date; label: string; sub: string; isToday: boolean }[];
}

export interface PositionedTimelineBooking extends TimelineBookingInput {
  leftPct: number;
  widthPct: number;
  clippedLeft: boolean;
  clippedRight: boolean;
  lane: number;
  isOverdue: boolean;
}

export interface TimelineFreeSlot {
  leftPct: number;
  widthPct: number;
  durationMs: number;
  label: string;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function addDays(d: Date, days: number): Date {
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + days,
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds(),
  );
}

export function resolveRangeDays(mode: TimelineRangeMode): number {
  const hit = TIMELINE_RANGE_PRESETS.find((p) => p.id === mode);
  return hit?.days ?? 14;
}

export function resolveHorizonAnchorForMode(mode: TimelineRangeMode): Date {
  if (mode === 'history') {
    return startOfDay(addDays(new Date(), -(resolveRangeDays('history') - 1)));
  }
  return startOfDay(new Date());
}

export function buildTimelineHorizon(anchor: Date, mode: TimelineRangeMode): TimelineHorizon {
  const dayCount = resolveRangeDays(mode);
  const start = startOfDay(anchor);
  const end = endOfDay(addDays(start, dayCount - 1));
  const today = startOfDay(new Date());

  const columns = Array.from({ length: dayCount }, (_, idx) => {
    const day = addDays(start, idx);
    return {
      date: day,
      label:
        dayCount <= 14
          ? day.toLocaleDateString('de-DE', { weekday: 'short' }).toUpperCase()
          : day.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
      sub:
        dayCount <= 14
          ? day.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
          : day.toLocaleDateString('de-DE', { year: '2-digit' }),
      isToday: day.getTime() === today.getTime(),
    };
  });

  return {
    start,
    end,
    fromIso: start.toISOString(),
    toIso: end.toISOString(),
    totalMs: Math.max(1, end.getTime() - start.getTime()),
    dayCount,
    columns,
  };
}

export function shiftTimelineAnchor(
  anchor: Date,
  mode: TimelineRangeMode,
  direction: -1 | 1,
): Date {
  const days = resolveRangeDays(mode);
  return addDays(startOfDay(anchor), direction * days);
}

export function formatHorizonRangeLabel(horizon: TimelineHorizon): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${fmt(horizon.start)} – ${fmt(horizon.end)}`;
}

export function positionAndPackTimelineBookings(
  bookings: TimelineBookingInput[],
  horizon: TimelineHorizon,
  now = Date.now(),
): { items: PositionedTimelineBooking[]; laneCount: number } {
  const startMs = horizon.start.getTime();
  const endMs = horizon.end.getTime();

  const positioned = bookings
    .filter((b) => b.endDate.getTime() >= startMs && b.startDate.getTime() <= endMs)
    .map((booking) => {
      const rawStart = booking.startDate.getTime();
      const rawEnd = booking.endDate.getTime();
      const clampedStart = Math.max(rawStart, startMs);
      const clampedEnd = Math.min(rawEnd, endMs);
      const leftPct = ((clampedStart - startMs) / horizon.totalMs) * 100;
      const widthPct = Math.max(0.8, ((clampedEnd - clampedStart) / horizon.totalMs) * 100);
      return {
        ...booking,
        leftPct,
        widthPct,
        clippedLeft: rawStart < startMs,
        clippedRight: rawEnd > endMs,
        lane: 0,
        isOverdue: booking.status === 'active' && booking.endDate.getTime() < now,
      };
    })
    .sort((a, b) => a.leftPct - b.leftPct || b.widthPct - a.widthPct);

  const laneEnds: number[] = [];
  for (const booking of positioned) {
    const start = booking.leftPct;
    const end = booking.leftPct + booking.widthPct;
    let lane = 0;
    for (; lane < laneEnds.length; lane += 1) {
      if (laneEnds[lane]! <= start + 0.05) break;
    }
    if (lane === laneEnds.length) laneEnds.push(end);
    else laneEnds[lane] = Math.max(laneEnds[lane]!, end);
    booking.lane = lane;
  }

  return { items: positioned, laneCount: Math.max(1, laneEnds.length) };
}

export function computeTimelineFreeSlots(
  bookings: TimelineBookingInput[],
  horizon: TimelineHorizon,
): TimelineFreeSlot[] {
  const startMs = horizon.start.getTime();
  const range = { start: horizon.start, end: horizon.end, totalMs: horizon.totalMs };
  const slots = calculateFreeSlots(bookings as AvailabilityBookingInput[], range);

  return slots.map((slot) => ({
    leftPct: ((slot.startMs - startMs) / horizon.totalMs) * 100,
    widthPct: ((slot.endMs - slot.startMs) / horizon.totalMs) * 100,
    durationMs: slot.durationMs,
    label: formatSlotDurationLabel(slot.durationMs),
  }));
}

export function formatDurationLabel(ms: number): string {
  return formatSlotDurationLabel(ms);
}

export function timelineNowMarkerPct(horizon: TimelineHorizon, now = Date.now()): number | null {
  const t = now;
  if (t < horizon.start.getTime() || t > horizon.end.getTime()) return null;
  return ((t - horizon.start.getTime()) / horizon.totalMs) * 100;
}
