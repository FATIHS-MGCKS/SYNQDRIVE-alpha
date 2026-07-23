export const BOOKING_CONCURRENCY_ERROR_CODES = {
  VERSION_REQUIRED: 'BOOKING_VERSION_REQUIRED',
  VERSION_CONFLICT: 'BOOKING_VERSION_CONFLICT',
} as const;

export type BookingVersionRefreshPayload = {
  bookingId: string;
  updatedAt: string;
  status: string;
  vehicleId: string;
  customerId: string;
  startDate: string;
  endDate: string;
  totalPriceCents: number | null;
};
