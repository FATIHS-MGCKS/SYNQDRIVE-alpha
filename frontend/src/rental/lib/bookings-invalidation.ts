export const BOOKINGS_LIST_INVALIDATED_EVENT = 'bookings:invalidated';

export function invalidateBookingsList(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(BOOKINGS_LIST_INVALIDATED_EVENT));
}
