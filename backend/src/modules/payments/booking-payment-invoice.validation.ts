import type { BookingPriceSnapshot, OrgInvoice } from '@prisma/client';
import { CurrencyMismatchError } from './payment-fee.errors';
import { SnapshotInvoiceConflictError } from './booking-payment-request.errors';
import { assertSupportedCurrency } from './payment-policy.service';

export interface SnapshotInvoiceValidationInput {
  snapshot: Pick<BookingPriceSnapshot, 'currency' | 'depositAmountCents'>;
  invoice: Pick<
    OrgInvoice,
    'currency' | 'totalCents' | 'paidCents' | 'outstandingCents' | 'status' | 'bookingId'
  >;
  rentalPaymentAmountCents: number;
  excludedDepositCents: number;
}

const CLOSED_INVOICE_STATUSES = new Set(['VOID', 'CANCELLED', 'CREDITED', 'PAID']);

export function validateSnapshotInvoiceAlignment(
  input: SnapshotInvoiceValidationInput,
): void {
  const snapshotCurrency = assertSupportedCurrency(input.snapshot.currency);
  const invoiceCurrency = assertSupportedCurrency(input.invoice.currency);

  if (snapshotCurrency !== invoiceCurrency) {
    throw new CurrencyMismatchError(snapshotCurrency, invoiceCurrency);
  }

  if (CLOSED_INVOICE_STATUSES.has(input.invoice.status)) {
    throw new SnapshotInvoiceConflictError(
      `Invoice is not open for payment (status ${input.invoice.status})`,
    );
  }

  const outstanding =
    input.invoice.outstandingCents
    ?? Math.max(0, input.invoice.totalCents - input.invoice.paidCents);

  if (outstanding <= 0) {
    throw new SnapshotInvoiceConflictError('Invoice has no outstanding balance');
  }

  if (input.rentalPaymentAmountCents <= 0) {
    throw new SnapshotInvoiceConflictError('Rental payment amount must be positive');
  }

  if (input.rentalPaymentAmountCents > outstanding) {
    throw new SnapshotInvoiceConflictError(
      `Rental payment amount ${input.rentalPaymentAmountCents} exceeds invoice outstanding ${outstanding}`,
    );
  }

  // Booking invoices exclude DEPOSIT line items — totalCents is rental-only.
  // Only subtract excluded deposit when the invoice total likely includes it.
  const depositLikelyOnInvoice =
    input.excludedDepositCents > 0
    && input.invoice.totalCents >= input.rentalPaymentAmountCents + input.excludedDepositCents;

  if (depositLikelyOnInvoice) {
    const invoiceTotalExDeposit = input.invoice.totalCents - input.excludedDepositCents;
    if (invoiceTotalExDeposit > 0 && input.rentalPaymentAmountCents > invoiceTotalExDeposit) {
      throw new SnapshotInvoiceConflictError(
        'Payment amount exceeds invoice rental total after excluding deposit',
      );
    }
  }
}

export function resolveRecipientEmail(
  override: string | undefined,
  customerEmail: string | null | undefined,
  bookingEmail: string | null | undefined,
): string | null {
  const candidate = override?.trim() || customerEmail?.trim() || bookingEmail?.trim();
  return candidate || null;
}
