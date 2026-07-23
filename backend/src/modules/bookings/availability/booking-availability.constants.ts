import { BookingStatus } from '@prisma/client';

/** Statuses that occupy vehicle availability (matches booking-conflict.util). */
export const BLOCKING_BOOKING_STATUSES: BookingStatus[] = [
  'PENDING',
  'CONFIRMED',
  'ACTIVE',
];

export const BOOKING_AVAILABILITY_ERROR_CODES = {
  BOOKING_CONFLICT: 'BOOKING_CONFLICT',
} as const;

/** PostgreSQL `exclusion_violation` — raised by GiST overlap constraint. */
export const PG_EXCLUSION_VIOLATION = '23P01';

export const BOOKING_VEHICLE_AVAILABILITY_EXCLUSION =
  'bookings_vehicle_availability_excl';
