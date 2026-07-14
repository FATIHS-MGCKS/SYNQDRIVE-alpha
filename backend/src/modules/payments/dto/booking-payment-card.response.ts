import type { BookingPaymentRequest, OrgInvoice, PaymentTransaction } from '@prisma/client';
import { truncateStripeRef } from '../utils/stripe-ref.util';

export interface BookingPaymentCardInvoiceDto {
  id: string;
  invoiceNumber: string | null;
  status: string;
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
}

export interface BookingPaymentCardRequestDto {
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
}

export interface BookingPaymentCardDto {
  enabled: boolean;
  summary: {
    bookingPaymentStatus: string;
    paymentIntent: string | null;
  };
  primaryRequest: BookingPaymentCardRequestDto | null;
  requests: BookingPaymentCardRequestDto[];
  invoice: BookingPaymentCardInvoiceDto | null;
}

function deriveRefundStatus(
  status: string,
  refundedAmountCents: number,
  amountCents: number,
): 'NONE' | 'PARTIAL' | 'FULL' {
  if (status === 'REFUNDED' || (refundedAmountCents > 0 && refundedAmountCents >= amountCents)) {
    return 'FULL';
  }
  if (status === 'PARTIALLY_REFUNDED' || refundedAmountCents > 0) {
    return 'PARTIAL';
  }
  return 'NONE';
}

function deriveDisputeStatus(status: string): 'NONE' | 'OPEN' {
  return status === 'DISPUTED' ? 'OPEN' : 'NONE';
}

function derivePaymentMethodLabel(
  request: BookingPaymentRequest,
  transactions: PaymentTransaction[],
): string | null {
  if (request.status === 'PAID' || request.paidAmountCents > 0) {
    const charge = transactions.find((tx) => tx.type === 'CHARGE' && tx.status === 'SUCCEEDED');
    if (charge) return 'Karte (Stripe)';
  }
  return null;
}

export function mapPaymentRequestToCardDto(
  request: BookingPaymentRequest,
  depositAmountCents: number,
  transactions: PaymentTransaction[] = [],
): BookingPaymentCardRequestDto {
  const openAmountCents = Math.max(0, request.amountCents - request.paidAmountCents);
  return {
    id: request.id,
    status: request.status,
    purpose: request.purpose,
    amountCents: request.amountCents,
    paidAmountCents: request.paidAmountCents,
    openAmountCents,
    refundedAmountCents: request.refundedAmountCents,
    currency: request.currency,
    depositAmountCents,
    recipientEmail: request.recipientEmail,
    checkoutUrl: request.checkoutUrl,
    checkoutExpiresAt: request.checkoutExpiresAt?.toISOString() ?? null,
    lastSentAt: request.lastSentAt?.toISOString() ?? null,
    paidAt: request.paidAt?.toISOString() ?? null,
    failedAt: request.failedAt?.toISOString() ?? null,
    cancelledAt: request.cancelledAt?.toISOString() ?? null,
    sendAttemptCount: request.sendAttemptCount,
    lastEmailErrorMessage: request.lastEmailErrorMessage,
    stripeCheckoutSessionId: truncateStripeRef(request.stripeCheckoutSessionId),
    stripePaymentIntentId: truncateStripeRef(request.stripePaymentIntentId),
    stripeChargeId: truncateStripeRef(request.stripeChargeId),
    paymentMethodLabel: derivePaymentMethodLabel(request, transactions),
    refundStatus: deriveRefundStatus(
      request.status,
      request.refundedAmountCents,
      request.amountCents,
    ),
    disputeStatus: deriveDisputeStatus(request.status),
  };
}

export function mapInvoiceToCardDto(invoice: OrgInvoice): BookingPaymentCardInvoiceDto {
  const outstandingCents = Math.max(0, invoice.totalCents - invoice.paidCents);
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumberDisplay ?? (invoice.invoiceNumber != null ? String(invoice.invoiceNumber) : null),
    status: invoice.status,
    totalCents: invoice.totalCents,
    paidCents: invoice.paidCents,
    outstandingCents,
  };
}
