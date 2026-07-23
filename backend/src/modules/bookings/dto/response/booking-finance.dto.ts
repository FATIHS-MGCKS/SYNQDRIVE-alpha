export interface BookingFinanceDto {
  basePriceCents: number | null;
  extrasPriceCents: number | null;
  discountAmountCents: number | null;
  depositAmountCents: number | null;
  depositStatus: string | null;
  taxRate: number | null;
  taxAmountCents: number | null;
  grossAmountCents: number | null;
  paidAmountCents: number | null;
  openAmountCents: number | null;
  paymentStatus: string | null;
  invoiceStatus: string | null;
  finalInvoiceStatus: string | null;
  additionalChargesCents: number | null;
  refundAmountCents: number | null;
  retainedDepositAmountCents: number | null;
  computed: boolean;
}

export interface BookingPaymentSummaryDto {
  enabled: boolean;
  summary: {
    bookingPaymentStatus: string;
    paymentIntent: string | null;
  };
  primaryRequestId: string | null;
  requestCount: number;
  invoiceId: string | null;
  invoiceStatus: string | null;
  outstandingCents: number | null;
}
