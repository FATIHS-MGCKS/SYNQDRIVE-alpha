import {
  bookingsForVehicleInRange,
  parseIso,
} from '../components/bookings/bookingUtils';
import type { BookingUiRow } from '../components/bookings/bookingTypes';

export interface BookingWindowConflictInput {
  vehicleId: string;
  pickupAt: string | null | undefined;
  returnAt: string | null | undefined;
  bookings: BookingUiRow[];
  excludeBookingId?: string | null;
}

/**
 * Booking-window overlap authority — delegates to `bookingsForVehicleInRange`
 * (pending/confirmed/active only; excludes cancelled/no_show/completed).
 */
export function hasBookingWindowConflict(input: BookingWindowConflictInput): boolean {
  if (!input.vehicleId || !input.pickupAt || !input.returnAt) return false;
  const rangeStart = parseIso(input.pickupAt);
  const rangeEnd = parseIso(input.returnAt);
  if (!rangeStart || !rangeEnd || rangeEnd <= rangeStart) return false;
  return (
    bookingsForVehicleInRange(
      input.bookings,
      input.vehicleId,
      rangeStart,
      rangeEnd,
      input.excludeBookingId ?? undefined,
    ).length > 0
  );
}
