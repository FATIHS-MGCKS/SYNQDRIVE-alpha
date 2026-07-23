/** Stable cancellation reason codes for audit and API contracts. */
export const BOOKING_CANCELLATION_REASON_CODES = [
  'CUSTOMER_REQUEST',
  'CUSTOMER_NO_LONGER_NEEDS',
  'VEHICLE_UNAVAILABLE',
  'PRICING_ERROR',
  'DUPLICATE_BOOKING',
  'WEATHER_FORCE_MAJEURE',
  'OPERATIONAL_DECISION',
  'OTHER',
] as const;

export type BookingCancellationReasonCode =
  (typeof BOOKING_CANCELLATION_REASON_CODES)[number];

export function isBookingCancellationReasonCode(
  value: string,
): value is BookingCancellationReasonCode {
  return (BOOKING_CANCELLATION_REASON_CODES as readonly string[]).includes(value);
}
