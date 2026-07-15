import type { VehicleBookingQueryRow } from './vehicle-booking-context.types';

export interface ReservationWindowResolveParams {
  evaluationAt: Date;
  organizationTimezone: string;
}

/**
 * Isolated reservation-window classifier for PENDING/CONFIRMED bookings.
 *
 * Concrete calendar-day window logic (`startOfCalendarDay`, org TZ) lands in
 * Prompt 11/43. Until then this returns `null` so all binding future bookings
 * flow into `nextBooking` / `futureBookingCount`.
 */
export function resolveReservationWindowBooking(
  candidates: VehicleBookingQueryRow[],
  _params: ReservationWindowResolveParams,
): VehicleBookingQueryRow | null {
  if (candidates.length === 0) return null;
  // Prompt 11: evaluate evaluationAt ∈ [windowStart, windowEnd) per booking.
  return null;
}
