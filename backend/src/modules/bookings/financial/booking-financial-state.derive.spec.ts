import {
  BookingFinancialState,
  BookingInvoiceProcessingState,
  BookingPaymentRequestStatus,
  BookingPaymentStatus,
} from '@prisma/client';
import {
  deriveBookingFinancialState,
  deriveInvoiceProcessingState,
  bookingRequiresIssuedInvoice,
} from './booking-financial-state.derive';

describe('booking-financial-state.derive', () => {
  const baseInvoice = {
    id: 'inv-1',
    status: 'ISSUED' as const,
    totalCents: 10_000,
    paidCents: 0,
    outstandingCents: 10_000,
    bookingPriceSnapshotId: 'snap-1',
    customerId: 'cust-1',
    currency: 'EUR',
  };

  it('marks cancelled bookings as NOT_REQUIRED', () => {
    expect(
      deriveBookingFinancialState({
        bookingStatus: 'CANCELLED',
        totalPriceCents: 10_000,
        bookingPaymentStatus: BookingPaymentStatus.UNPAID,
        invoiceProcessingState: BookingInvoiceProcessingState.READY,
        invoiceProcessingError: null,
        canonicalInvoice: baseInvoice,
        paymentRequestStatuses: [],
        currentSnapshotId: 'snap-1',
      }),
    ).toBe(BookingFinancialState.NOT_REQUIRED);
  });

  it('requires issued invoice for confirmed bookings without invoice', () => {
    expect(
      deriveBookingFinancialState({
        bookingStatus: 'CONFIRMED',
        totalPriceCents: 10_000,
        bookingPaymentStatus: BookingPaymentStatus.UNPAID,
        invoiceProcessingState: BookingInvoiceProcessingState.PENDING,
        invoiceProcessingError: null,
        canonicalInvoice: null,
        paymentRequestStatuses: [],
        currentSnapshotId: 'snap-1',
      }),
    ).toBe(BookingFinancialState.FAILED);
  });

  it('maps paid invoice to PAID financial state', () => {
    expect(
      deriveBookingFinancialState({
        bookingStatus: 'CONFIRMED',
        totalPriceCents: 10_000,
        bookingPaymentStatus: BookingPaymentStatus.UNPAID,
        invoiceProcessingState: BookingInvoiceProcessingState.READY,
        invoiceProcessingError: null,
        canonicalInvoice: { ...baseInvoice, status: 'PAID', paidCents: 10_000, outstandingCents: 0 },
        paymentRequestStatuses: [],
        currentSnapshotId: 'snap-1',
      }),
    ).toBe(BookingFinancialState.PAID);
  });

  it('detects refund pending from payment requests', () => {
    expect(
      deriveBookingFinancialState({
        bookingStatus: 'ACTIVE',
        totalPriceCents: 10_000,
        bookingPaymentStatus: BookingPaymentStatus.PAID,
        invoiceProcessingState: BookingInvoiceProcessingState.READY,
        invoiceProcessingError: null,
        canonicalInvoice: baseInvoice,
        paymentRequestStatuses: [BookingPaymentRequestStatus.DISPUTED],
        currentSnapshotId: 'snap-1',
      }),
    ).toBe(BookingFinancialState.REFUND_PENDING);
  });

  it('derives invoice processing FAILED from persisted state', () => {
    expect(
      deriveInvoiceProcessingState({
        bookingStatus: 'CONFIRMED',
        totalPriceCents: 10_000,
        persistedState: BookingInvoiceProcessingState.FAILED,
        canonicalInvoice: null,
      }),
    ).toBe(BookingInvoiceProcessingState.FAILED);
  });

  it('bookingRequiresIssuedInvoice is true for confirmed-like statuses', () => {
    expect(bookingRequiresIssuedInvoice('CONFIRMED')).toBe(true);
    expect(bookingRequiresIssuedInvoice('PENDING')).toBe(false);
  });
});
