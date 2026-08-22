import { BookingStatus } from '@prisma/client';

/** Statuses considered active/relevant for communication context resolution. */
export const COMMUNICATION_ELIGIBLE_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
  BookingStatus.ACTIVE,
];

export function isBookingEligibleForCommunicationResolution(status: BookingStatus): boolean {
  return COMMUNICATION_ELIGIBLE_BOOKING_STATUSES.includes(status);
}
