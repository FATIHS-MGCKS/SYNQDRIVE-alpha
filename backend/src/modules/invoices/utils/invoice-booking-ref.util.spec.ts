import { invoiceBookingRef } from './invoice-booking-ref.util';

describe('invoiceBookingRef (audit baseline)', () => {
  it('formats a public booking reference from the id suffix, not a UUID fragment', () => {
    const bookingId = 'book-99999999-8888-7777-6666-555555555555';
    expect(invoiceBookingRef(bookingId)).toBe('BK-555555');
    expect(invoiceBookingRef(bookingId)).not.toContain('book-9999');
    expect(invoiceBookingRef(bookingId)).not.toMatch(/^[0-9a-f]{8}/i);
  });
});
