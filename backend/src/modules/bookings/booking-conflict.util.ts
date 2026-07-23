import { BookingStatus } from '@prisma/client';
import { BLOCKING_BOOKING_STATUSES } from './availability/booking-availability.constants';

export { BLOCKING_BOOKING_STATUSES };

export type BookingOverlapInput = {
  organizationId: string;
  vehicleId: string;
  startDate: Date;
  endDate: Date;
  excludeBookingId?: string;
};

export function assertValidBookingWindow(startDate: Date, endDate: Date): void {
  if (isNaN(+startDate) || isNaN(+endDate)) {
    throw new Error('INVALID_DATES');
  }
  if (endDate <= startDate) {
    throw new Error('END_BEFORE_START');
  }
}

export function buildOverlapWhere(input: BookingOverlapInput) {
  return {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    status: { in: BLOCKING_BOOKING_STATUSES },
    startDate: { lt: input.endDate },
    endDate: { gt: input.startDate },
    ...(input.excludeBookingId ? { id: { not: input.excludeBookingId } } : {}),
  };
}
