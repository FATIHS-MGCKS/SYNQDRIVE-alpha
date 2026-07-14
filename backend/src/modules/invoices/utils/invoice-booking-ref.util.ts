/** Public booking reference — never expose raw UUID in list UI. */
export function invoiceBookingRef(bookingId: string): string {
  return `BK-${String(bookingId).slice(-6).toUpperCase()}`;
}
