/** Stable automation rule id for confirmed-booking preparation (Task Domain V2). */
export const BOOKING_PREPARATION_RULE_ID = 'booking.lifecycle.confirmed.prep' as const;

export const BOOKING_PREPARATION_RULE_VERSION = 1;

export const BOOKING_PICKUP_RULE_ID = 'booking.lifecycle.confirmed.pickup' as const;

export const BOOKING_PICKUP_RULE_VERSION = 1;

export const BOOKING_RETURN_RULE_ID = 'booking.lifecycle.active.return' as const;

export const BOOKING_RETURN_RULE_VERSION = 1;

/** Canonical dedup key — one open preparation task per booking in CONFIRMED phase. */
export function bookingPreparationDedupKey(bookingId: string): string {
  return `booking:prep:${bookingId}`;
}

/** Canonical dedup key — one pickup handover task per booking. */
export function bookingPickupDedupKey(bookingId: string): string {
  return `booking:pickup:${bookingId}`;
}

/** Canonical dedup key — one return handover task per booking. */
export function bookingReturnDedupKey(bookingId: string): string {
  return `booking:return:${bookingId}`;
}

/**
 * Legacy CONFIRMED-phase keys still referenced by rows created before the
 * single-task preparation model. Kept in the active set so re-processing
 * CONFIRMED does not supersede existing clean/document tasks (no backfill).
 */
export const LEGACY_CONFIRMED_BOOKING_DEDUP_KEYS = ['booking:document'] as const;

export function legacyConfirmedBookingDedupKeys(bookingId: string): string[] {
  return LEGACY_CONFIRMED_BOOKING_DEDUP_KEYS.map((prefix) => `${prefix}:${bookingId}`);
}

export function confirmedPhaseActiveDedupKeys(bookingId: string): string[] {
  return [
    bookingPreparationDedupKey(bookingId),
    bookingPickupDedupKey(bookingId),
    ...legacyConfirmedBookingDedupKeys(bookingId),
  ];
}

export function activeRentalPhaseDedupKeys(bookingId: string): string[] {
  return [bookingReturnDedupKey(bookingId)];
}
