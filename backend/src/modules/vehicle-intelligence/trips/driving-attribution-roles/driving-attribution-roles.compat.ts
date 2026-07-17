import type { RentalDrivingAnalysis } from '@prisma/client';

type RentalAnalysisRoleRow = Pick<
  RentalDrivingAnalysis,
  'bookingCustomerId' | 'assignedDriverId' | 'actualDriverId' | 'driverId'
>;

/** Read legacy rows where driverId stored the booking customer. */
export function readRentalAnalysisBookingCustomerId(row: RentalAnalysisRoleRow): string {
  return row.bookingCustomerId ?? row.driverId ?? '';
}

/** Legacy API filter: driverId query meant booking customer, not actual driver. */
export function resolveLegacyDriverIdFilter(input: {
  driverId?: string;
  bookingCustomerId?: string;
}): { bookingCustomerId?: string } {
  const bookingCustomerId = input.bookingCustomerId ?? input.driverId;
  return bookingCustomerId ? { bookingCustomerId } : {};
}
