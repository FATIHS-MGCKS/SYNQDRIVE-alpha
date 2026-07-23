/** Stable idempotency keys for booking status commands (Prompt 9). */
export function createBookingStatusIdempotencyKey(
  action: string,
  bookingId: string,
  nonce?: string,
): string {
  const id =
    nonce ??
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  return `${action}:${bookingId}:${id}`;
}

export type BookingStatusCommandApiResponse = {
  booking: {
    id: string;
    organizationId: string;
    status: string;
    startDate: string;
    endDate: string;
    cancelledAt: string | null;
    completedAt: string | null;
    notes: string | null;
    updatedAt: string;
    vehicleId: string;
    customerId: string;
  };
  transition: {
    command: string;
    from: string | null;
    to: string;
    trigger: string;
    reasonCode: string;
    idempotent: boolean;
    replayed: boolean;
  };
};
