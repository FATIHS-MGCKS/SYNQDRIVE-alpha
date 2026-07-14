import type { BookingPaymentRequest } from '@prisma/client';
import type { BookingPaymentRequestResult } from '../booking-payment-request.service';
import { truncateStripeRef } from '../utils/stripe-ref.util';

export interface BookingPaymentRequestResponse {
  id: string;
  status: string;
  purpose: string;
  amountCents: number;
  paidAmountCents: number;
  openAmountCents: number;
  refundedAmountCents: number;
  currency: string;
  depositInfoCents: number;
  recipientEmail: string | null;
  checkoutUrl: string | null;
  checkoutExpiresAt: string | null;
  sendEmailOnLink: boolean;
  sendAttemptCount: number;
  lastSentAt: string | null;
  lastEmailErrorMessage: string | null;
  paidAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  applicationFeeAmountCents?: number;
  feePolicyVersion?: string | null;
}

export function mapBookingPaymentRequestResponse(
  result: BookingPaymentRequestResult,
): BookingPaymentRequestResponse {
  const { request, depositInfoCents, canViewFee } = result;
  const base: BookingPaymentRequestResponse = {
    id: request.id,
    status: request.status,
    purpose: request.purpose,
    amountCents: request.amountCents,
    paidAmountCents: request.paidAmountCents,
    openAmountCents: Math.max(0, request.amountCents - request.paidAmountCents),
    refundedAmountCents: request.refundedAmountCents,
    currency: request.currency,
    depositInfoCents,
    recipientEmail: request.recipientEmail,
    checkoutUrl: request.checkoutUrl,
    checkoutExpiresAt: request.checkoutExpiresAt?.toISOString() ?? null,
    sendEmailOnLink: request.sendEmailOnLink,
    sendAttemptCount: request.sendAttemptCount,
    lastSentAt: request.lastSentAt?.toISOString() ?? null,
    lastEmailErrorMessage: request.lastEmailErrorMessage,
    paidAt: request.paidAt?.toISOString() ?? null,
    failedAt: request.failedAt?.toISOString() ?? null,
    cancelledAt: request.cancelledAt?.toISOString() ?? null,
    stripeCheckoutSessionId: truncateStripeRef(request.stripeCheckoutSessionId),
    stripePaymentIntentId: truncateStripeRef(request.stripePaymentIntentId),
  };

  if (canViewFee) {
    base.applicationFeeAmountCents = request.applicationFeeAmountCents ?? undefined;
    base.feePolicyVersion = request.feePolicyVersion;
  }

  return base;
}

export function mapExistingRequestResponse(
  request: BookingPaymentRequest,
  depositInfoCents: number,
  canViewFee: boolean,
): BookingPaymentRequestResponse {
  return mapBookingPaymentRequestResponse({ request, depositInfoCents, canViewFee });
}
