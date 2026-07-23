import {
  BookingFinancialState,
  BookingInvoiceProcessingState,
  BookingPaymentRequestStatus,
  BookingPaymentStatus,
  BookingStatus,
} from '@prisma/client';
import type { BookingFinancialDerivationInput } from './booking-financial-state.types';
import { CONFIRMED_LIKE_BOOKING_STATUSES } from './booking-financial-state.types';

const REFUND_PENDING_REQUEST_STATUSES: readonly BookingPaymentRequestStatus[] = [
  'PARTIALLY_REFUNDED',
  'DISPUTED',
] as const;

const TERMINAL_CANCEL_STATUSES: readonly BookingStatus[] = ['CANCELLED', 'NO_SHOW'] as const;

export function bookingRequiresIssuedInvoice(status: BookingStatus): boolean {
  return (CONFIRMED_LIKE_BOOKING_STATUSES as readonly string[]).includes(status);
}

export function deriveInvoiceProcessingState(input: {
  bookingStatus: BookingStatus;
  totalPriceCents: number | null;
  persistedState: BookingInvoiceProcessingState;
  canonicalInvoice: BookingFinancialDerivationInput['canonicalInvoice'];
}): BookingInvoiceProcessingState {
  if ((TERMINAL_CANCEL_STATUSES as readonly string[]).includes(input.bookingStatus)) {
    return BookingInvoiceProcessingState.NOT_REQUIRED;
  }
  if (input.totalPriceCents == null || input.totalPriceCents <= 0) {
    return BookingInvoiceProcessingState.NOT_REQUIRED;
  }
  if (!bookingRequiresIssuedInvoice(input.bookingStatus)) {
    return input.canonicalInvoice
      ? BookingInvoiceProcessingState.READY
      : BookingInvoiceProcessingState.PENDING;
  }
  if (input.persistedState === BookingInvoiceProcessingState.FAILED) {
    return BookingInvoiceProcessingState.FAILED;
  }
  if (input.persistedState === BookingInvoiceProcessingState.PROCESSING) {
    return BookingInvoiceProcessingState.PROCESSING;
  }
  if (!input.canonicalInvoice) {
    return BookingInvoiceProcessingState.PENDING;
  }
  if (input.canonicalInvoice.status === 'DRAFT') {
    return BookingInvoiceProcessingState.PENDING;
  }
  return BookingInvoiceProcessingState.READY;
}

export function deriveBookingFinancialState(
  input: BookingFinancialDerivationInput,
): BookingFinancialState {
  const refundPending = input.paymentRequestStatuses.some((status) =>
    (REFUND_PENDING_REQUEST_STATUSES as readonly string[]).includes(status),
  );
  if (refundPending) {
    return BookingFinancialState.REFUND_PENDING;
  }

    if (
      input.bookingPaymentStatus === BookingPaymentStatus.REFUNDED ||
      (input.paymentRequestStatuses.length > 0 &&
        input.paymentRequestStatuses.every(
          (status) => status === BookingPaymentRequestStatus.REFUNDED,
        ))
    ) {
    return BookingFinancialState.REFUNDED;
  }

  if ((TERMINAL_CANCEL_STATUSES as readonly string[]).includes(input.bookingStatus)) {
    return BookingFinancialState.NOT_REQUIRED;
  }

  if (input.totalPriceCents == null || input.totalPriceCents <= 0) {
    return BookingFinancialState.NOT_REQUIRED;
  }

  if (input.invoiceProcessingState === BookingInvoiceProcessingState.FAILED) {
    return BookingFinancialState.FAILED;
  }
  if (input.invoiceProcessingState === BookingInvoiceProcessingState.PROCESSING) {
    return BookingFinancialState.PROCESSING;
  }

  const invoice = input.canonicalInvoice;
  const requiresInvoice = bookingRequiresIssuedInvoice(input.bookingStatus);

  if (requiresInvoice && !invoice) {
    return BookingFinancialState.FAILED;
  }

  if (
    input.bookingPaymentStatus === BookingPaymentStatus.PAID ||
    invoice?.status === 'PAID'
  ) {
    return BookingFinancialState.PAID;
  }

  if (
    input.bookingPaymentStatus === BookingPaymentStatus.PARTIALLY_PAID ||
    (invoice != null && invoice.paidCents > 0 && invoice.outstandingCents > 0)
  ) {
    return BookingFinancialState.PARTIALLY_PAID;
  }

  if (
    invoice &&
    ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE', 'PAID'].includes(invoice.status)
  ) {
    return BookingFinancialState.READY;
  }

  if (input.invoiceProcessingState === BookingInvoiceProcessingState.PENDING) {
    return BookingFinancialState.PENDING;
  }

  return BookingFinancialState.PENDING;
}
