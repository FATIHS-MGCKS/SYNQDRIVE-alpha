import type { TripAttributionBookingOverlap } from './trip-attribution.types';
import type { BookingOverlapCandidate } from './trip-canonical-hydration.types';

export function pickBookingForAssignment(
  trip: {
    vehicleId: string;
    startTime: Date;
    endTime: Date | null;
  },
  candidates: BookingOverlapCandidate[],
): BookingOverlapCandidate | null {
  const tripEnd = trip.endTime ?? trip.startTime;
  const matches = candidates.filter(
    (booking) =>
      booking.vehicleId === trip.vehicleId &&
      booking.startDate <= tripEnd &&
      booking.endDate >= trip.startTime,
  );
  if (matches.length === 0) return null;
  return (
    [...matches].sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0] ?? null
  );
}

export function pickBookingOverlapCandidate(
  trip: {
    vehicleId: string;
    startTime: Date;
    endTime: Date | null;
    assignedBookingId?: string | null;
  },
  candidates: BookingOverlapCandidate[],
): TripAttributionBookingOverlap | null {
  const tripEnd = trip.endTime ?? trip.startTime;
  let matches = candidates.filter(
    (booking) =>
      booking.vehicleId === trip.vehicleId &&
      booking.startDate <= tripEnd &&
      booking.endDate >= trip.startTime,
  );
  if (trip.assignedBookingId) {
    matches = matches.filter((booking) => booking.id === trip.assignedBookingId);
  }
  if (matches.length === 0) return null;

  const booking = [...matches].sort(
    (a, b) => b.startDate.getTime() - a.startDate.getTime(),
  )[0]!;

  return {
    bookingId: booking.id,
    bookingCustomerId: booking.customerId,
    assignedDriverId: booking.assignedDriverId,
    customerType: booking.customer.customerType,
  };
}
