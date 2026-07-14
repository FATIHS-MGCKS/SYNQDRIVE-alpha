import type { BookingPaymentRequest } from '@prisma/client';
import { mapBookingPaymentRequestResponse } from './booking-payment-request.response';

export interface BookingPaymentRefundResponse {
  paymentRequest: ReturnType<typeof mapBookingPaymentRequestResponse>;
  refundAmountCents: number;
  applicationFeeRefundCents: number;
  refundableAmountCents: number;
  stripeRefundId: string;
  idempotentReplay: boolean;
}

export function mapBookingPaymentRefundResponse(params: {
  request: BookingPaymentRequest;
  depositInfoCents: number;
  canViewFee: boolean;
  refundAmountCents: number;
  applicationFeeRefundCents: number;
  refundableAmountCents: number;
  stripeRefundId: string;
  idempotentReplay: boolean;
}): BookingPaymentRefundResponse {
  return {
    paymentRequest: mapBookingPaymentRequestResponse({
      request: params.request,
      depositInfoCents: params.depositInfoCents,
      canViewFee: params.canViewFee,
    }),
    refundAmountCents: params.refundAmountCents,
    applicationFeeRefundCents: params.applicationFeeRefundCents,
    refundableAmountCents: params.refundableAmountCents,
    stripeRefundId: params.stripeRefundId,
    idempotentReplay: params.idempotentReplay,
  };
}
