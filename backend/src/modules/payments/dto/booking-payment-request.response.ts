import type { BookingPaymentRequest } from '@prisma/client';
import type { BookingPaymentRequestResult } from '../booking-payment-request.service';

export interface BookingPaymentRequestResponse {
  id: string;
  status: string;
  amountCents: number;
  currency: string;
  depositInfoCents: number;
  recipientEmail: string | null;
  checkoutExpiresAt: string | null;
  sendEmailOnLink: boolean;
  sendAttemptCount: number;
  lastSentAt: string | null;
  lastEmailErrorMessage: string | null;
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
    amountCents: request.amountCents,
    currency: request.currency,
    depositInfoCents,
    recipientEmail: request.recipientEmail,
    checkoutExpiresAt: request.checkoutExpiresAt?.toISOString() ?? null,
    sendEmailOnLink: request.sendEmailOnLink,
    sendAttemptCount: request.sendAttemptCount,
    lastSentAt: request.lastSentAt?.toISOString() ?? null,
    lastEmailErrorMessage: request.lastEmailErrorMessage,
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
