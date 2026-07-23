import type {
  BookingFinancialState,
  BookingInvoiceProcessingState,
  BookingPaymentRequestStatus,
  BookingPaymentStatus,
  BookingStatus,
  OrgInvoiceStatus,
} from '@prisma/client';

export const BOOKING_FINANCIAL_ERROR_CODES = {
  INVOICE_REQUIRED: 'BOOKING_INVOICE_REQUIRED',
  INVOICE_PROCESSING_FAILED: 'BOOKING_INVOICE_PROCESSING_FAILED',
  INVOICE_SNAPSHOT_MISMATCH: 'BOOKING_INVOICE_SNAPSHOT_MISMATCH',
  FINANCIAL_DATA_FORBIDDEN: 'BOOKING_FINANCIAL_DATA_FORBIDDEN',
} as const;

export const CONFIRMED_LIKE_BOOKING_STATUSES: readonly BookingStatus[] = [
  'CONFIRMED',
  'ACTIVE',
  'COMPLETED',
] as const;

export interface BookingFinancialDerivationInput {
  bookingStatus: BookingStatus;
  totalPriceCents: number | null;
  bookingPaymentStatus: BookingPaymentStatus;
  invoiceProcessingState: BookingInvoiceProcessingState;
  invoiceProcessingError: string | null;
  canonicalInvoice: {
    id: string;
    status: OrgInvoiceStatus;
    totalCents: number;
    paidCents: number;
    outstandingCents: number;
    bookingPriceSnapshotId: string | null;
    customerId: string | null;
    currency: string;
  } | null;
  paymentRequestStatuses: BookingPaymentRequestStatus[];
  currentSnapshotId: string | null;
}

export interface BookingFinancialReadModel {
  financialState: BookingFinancialState;
  invoiceProcessingState: BookingInvoiceProcessingState;
  invoiceProcessingError: string | null;
  invoiceProcessingAttemptCount: number;
  invoiceProcessingNextRetryAt: string | null;
  canonicalInvoiceId: string | null;
  priceSnapshotId: string | null;
  priceSnapshotRevision: number | null;
  invoiceRequired: boolean;
  invoiceReady: boolean;
  recoveryAvailable: boolean;
}

export const REDACTED_FINANCE_DETAIL = {
  basePriceCents: null,
  extrasPriceCents: null,
  discountAmountCents: null,
  depositAmountCents: null,
  depositStatus: null,
  taxRate: null,
  taxAmountCents: null,
  grossAmountCents: null,
  paidAmountCents: null,
  openAmountCents: null,
  paymentStatus: null,
  invoiceStatus: null,
  finalInvoiceStatus: null,
  additionalChargesCents: null,
  refundAmountCents: null,
  retainedDepositAmountCents: null,
  computed: false,
  financialState: null,
  invoiceProcessingState: null,
  invoiceProcessingError: null,
  invoiceProcessingAttemptCount: null,
  invoiceProcessingNextRetryAt: null,
  canonicalInvoiceId: null,
  priceSnapshotId: null,
  priceSnapshotRevision: null,
  invoiceRequired: null,
  invoiceReady: null,
  recoveryAvailable: null,
  redacted: true,
} as const;
