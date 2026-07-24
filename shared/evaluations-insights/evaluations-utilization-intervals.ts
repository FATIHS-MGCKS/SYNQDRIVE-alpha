/**
 * Pure interval math for Auswertungen utilization (Prompt 22/54).
 * Aligned with frontend vehicle-availability-intelligence.utils semantics.
 */

export const MS_HOUR = 60 * 60 * 1000;
export const MS_DAY = 24 * MS_HOUR;

export type UtilizationBookingStatus =
  | 'pending'
  | 'confirmed'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export const UTILIZATION_FORECAST_STATUSES: UtilizationBookingStatus[] = [
  'pending',
  'confirmed',
  'active',
];
export const UTILIZATION_REALIZED_STATUSES: UtilizationBookingStatus[] = ['active', 'completed'];
export const UTILIZATION_OCCUPANCY_STATUSES: UtilizationBookingStatus[] = [
  ...UTILIZATION_FORECAST_STATUSES,
  'completed',
];
export const UTILIZATION_BLOCKING_STATUSES: UtilizationBookingStatus[] = [
  'pending',
  'confirmed',
  'active',
  'completed',
];

export interface UtilizationTimeRange {
  fromMs: number;
  toMs: number;
}

export interface UtilizationBookingInterval {
  bookingId: string;
  vehicleId: string;
  status: UtilizationBookingStatus;
  startMs: number;
  endMs: number;
}

export interface MergedInterval {
  startMs: number;
  endMs: number;
  bookingIds: string[];
}

export function utilizationRangeMs(range: UtilizationTimeRange): number {
  return Math.max(1, range.toMs - range.fromMs);
}

export function clampIntervalToRange(
  startMs: number,
  endMs: number,
  range: UtilizationTimeRange,
): { startMs: number; endMs: number } | null {
  const clampedStart = Math.max(startMs, range.fromMs);
  const clampedEnd = Math.min(endMs, range.toMs);
  if (clampedEnd <= clampedStart) return null;
  return { startMs: clampedStart, endMs: clampedEnd };
}

export function mergeIntervals(intervals: Array<{ startMs: number; endMs: number; bookingId?: string }>): MergedInterval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs);
  const merged: MergedInterval[] = [];
  let current: MergedInterval = {
    startMs: sorted[0]!.startMs,
    endMs: sorted[0]!.endMs,
    bookingIds: sorted[0]!.bookingId ? [sorted[0]!.bookingId] : [],
  };

  for (let i = 1; i < sorted.length; i += 1) {
    const next = sorted[i]!;
    if (next.startMs <= current.endMs) {
      current.endMs = Math.max(current.endMs, next.endMs);
      if (next.bookingId) current.bookingIds.push(next.bookingId);
    } else {
      merged.push(current);
      current = {
        startMs: next.startMs,
        endMs: next.endMs,
        bookingIds: next.bookingId ? [next.bookingId] : [],
      };
    }
  }
  merged.push(current);
  return merged;
}

export function sumIntervalMs(intervals: Array<{ startMs: number; endMs: number }>): number {
  return intervals.reduce((sum, iv) => sum + (iv.endMs - iv.startMs), 0);
}

export function intervalsFromBookings(
  bookings: UtilizationBookingInterval[],
  range: UtilizationTimeRange,
  statuses: UtilizationBookingStatus[],
): MergedInterval[] {
  const clamped = bookings
    .filter((b) => statuses.includes(b.status))
    .map((b) => {
      const iv = clampIntervalToRange(b.startMs, b.endMs, range);
      if (!iv) return null;
      return { ...iv, bookingId: b.bookingId };
    })
    .filter((iv): iv is { startMs: number; endMs: number; bookingId: string } => iv != null);
  return mergeIntervals(clamped);
}

export function detectOverlappingBlockingBookings(
  bookings: UtilizationBookingInterval[],
  range: UtilizationTimeRange,
): string[] {
  const blocking = bookings.filter((b) => UTILIZATION_BLOCKING_STATUSES.includes(b.status));
  const overlaps: string[] = [];
  for (let i = 0; i < blocking.length; i += 1) {
    for (let j = i + 1; j < blocking.length; j += 1) {
      const a = blocking[i]!;
      const b = blocking[j]!;
      if (a.vehicleId !== b.vehicleId) continue;
      const aIv = clampIntervalToRange(a.startMs, a.endMs, range);
      const bIv = clampIntervalToRange(b.startMs, b.endMs, range);
      if (!aIv || !bIv) continue;
      if (aIv.startMs < bIv.endMs && bIv.startMs < aIv.endMs) {
        overlaps.push(a.bookingId, b.bookingId);
      }
    }
  }
  return [...new Set(overlaps)];
}

export function computeTurnaroundMs(
  bookings: UtilizationBookingInterval[],
  range: UtilizationTimeRange,
): { totalMs: number; count: number } {
  const byVehicle = new Map<string, UtilizationBookingInterval[]>();
  for (const b of bookings) {
    if (!UTILIZATION_REALIZED_STATUSES.includes(b.status)) continue;
    const list = byVehicle.get(b.vehicleId) ?? [];
    list.push(b);
    byVehicle.set(b.vehicleId, list);
  }

  let totalMs = 0;
  let count = 0;
  for (const list of byVehicle.values()) {
    const sorted = [...list].sort((a, b) => a.endMs - b.endMs);
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const gapStart = sorted[i]!.endMs;
      const gapEnd = sorted[i + 1]!.startMs;
      const iv = clampIntervalToRange(gapStart, gapEnd, range);
      if (iv && iv.endMs > iv.startMs) {
        totalMs += iv.endMs - iv.startMs;
        count += 1;
      }
    }
  }
  return { totalMs, count };
}

export function utilizationPercent(partMs: number, totalMs: number): number | null {
  if (totalMs <= 0) return null;
  return Math.min(100, Math.round((partMs / totalMs) * 1000) / 10);
}
