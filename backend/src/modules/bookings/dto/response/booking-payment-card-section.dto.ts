export type BookingPaymentCardRequestItemDto = {
  id: string;
  status: string;
  purpose: string;
  amountCents: number;
  paidAmountCents: number;
  openAmountCents: number;
  refundedAmountCents: number;
  currency: string;
  depositAmountCents: number;
  recipientEmail: string | null;
  checkoutUrl: string | null;
  checkoutExpiresAt: string | null;
  lastSentAt: string | null;
  paidAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  sendAttemptCount: number;
  lastEmailErrorMessage: string | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  paymentMethodLabel: string | null;
  refundStatus: 'NONE' | 'PARTIAL' | 'FULL';
  disputeStatus: 'NONE' | 'OPEN';
};

export type BookingPaymentCardSectionDto = {
  enabled: boolean;
  summary: {
    bookingPaymentStatus: string;
    paymentIntent: string | null;
  };
  primaryRequest: BookingPaymentCardRequestItemDto | null;
  requests: BookingPaymentCardRequestItemDto[];
  invoice: {
    id: string;
    invoiceNumber: string | null;
    status: string;
    totalCents: number;
    paidCents: number;
    outstandingCents: number;
  } | null;
};
