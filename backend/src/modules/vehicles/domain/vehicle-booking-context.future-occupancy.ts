import { isBindingReservationBooking } from './vehicle-booking-context.reservation-window';
import type { VehicleBookingQueryRow } from './vehicle-booking-context.types';
import { compareBookingsByPickupStable } from './vehicle-booking-context.types';

export interface FutureOccupancyResolveParams {
  evaluationAt: Date;
  /** Booking ids already assigned to active or reservation-window slots. */
  excludeBookingIds: string[];
}

export interface FutureOccupancyResolveResult {
  nextRow: VehicleBookingQueryRow | null;
  /** Chronological tail after `nextRow` (excludes active/reservation/next). */
  furtherRows: VehicleBookingQueryRow[];
  futureBookingCount: number;
}

/**
 * Relevant future occupancy row — binding PENDING/CONFIRMED, not terminal,
 * rental interval still open at evaluation time.
 *
 * Wizard checkout drafts are excluded (same semantics as reservation window).
 * Cancelled, completed, and no-show rows are excluded upstream.
 */
export function isRelevantFutureOccupancyBooking(
  row: VehicleBookingQueryRow,
  evaluationAt: Date,
): boolean {
  if (!isBindingReservationBooking(row)) return false;
  if (row.endDate.getTime() < evaluationAt.getTime()) return false;
  return true;
}

/**
 * Resolves chronologically next future binding booking and the count of
 * further future bookings. Does not assign operational RESERVED status.
 */
export function resolveFutureOccupancy(
  candidates: VehicleBookingQueryRow[],
  params: FutureOccupancyResolveParams,
): FutureOccupancyResolveResult {
  const excluded = new Set(params.excludeBookingIds);

  const futureQueue = candidates
    .filter((b) => isRelevantFutureOccupancyBooking(b, params.evaluationAt))
    .filter((b) => !excluded.has(b.id))
    .sort(compareBookingsByPickupStable);

  const nextRow = futureQueue[0] ?? null;
  const furtherRows = futureQueue.slice(1);

  return {
    nextRow,
    furtherRows,
    futureBookingCount: furtherRows.length,
  };
}
