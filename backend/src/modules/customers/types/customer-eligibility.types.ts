import { BookingStatus } from '@prisma/client';

export type CustomerEligibilityResult = {
  customerId: string;
  canCreatePendingBooking: boolean;
  canConfirmBooking: boolean;
  canStartRental: boolean;
  blockingReasons: string[];
  warnings: string[];
  requiredActions: string[];
};

export type CustomerEligibilityEvaluateOptions = {
  requestedStatus?: BookingStatus;
  startDate?: Date | null;
  endDate?: Date | null;
  bookingId?: string | null;
};

export class CustomerBookingBlockedException extends Error {
  readonly code = 'CUSTOMER_BOOKING_BLOCKED';
  readonly customerId: string;
  readonly blockingReasons: string[];
  readonly warnings: string[];
  readonly requiredActions: string[];

  constructor(
    message: string,
    customerId: string,
    blockingReasons: string[],
    warnings: string[] = [],
    requiredActions: string[] = [],
  ) {
    super(message);
    this.customerId = customerId;
    this.blockingReasons = blockingReasons;
    this.warnings = warnings;
    this.requiredActions = requiredActions;
  }
}
