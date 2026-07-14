import { HttpException, HttpStatus } from '@nestjs/common';

export type BookingPaymentRefundErrorCode =
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'PAYMENT_REQUEST_NOT_REFUNDABLE'
  | 'REFUND_EXCEEDS_REFUNDABLE'
  | 'MISSING_STRIPE_CHARGE'
  | 'MISSING_CONNECTED_ACCOUNT'
  | 'LIVEMODE_MISMATCH'
  | 'ORG_MISMATCH'
  | 'DEPOSIT_REFUND_NOT_SUPPORTED'
  | 'STRIPE_REFUND_FAILED';

export class BookingPaymentRefundDomainError extends HttpException {
  constructor(
    message: string,
    public readonly code: BookingPaymentRefundErrorCode,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ message, code }, status);
    this.name = 'BookingPaymentRefundDomainError';
  }
}

export class RefundIdempotencyKeyRequiredError extends BookingPaymentRefundDomainError {
  constructor() {
    super('Idempotency-Key header is required', 'IDEMPOTENCY_KEY_REQUIRED', HttpStatus.BAD_REQUEST);
    this.name = 'RefundIdempotencyKeyRequiredError';
  }
}

export class PaymentRequestNotRefundableError extends BookingPaymentRefundDomainError {
  constructor(detail?: string) {
    super(
      detail ?? 'Payment request is not in a refundable state',
      'PAYMENT_REQUEST_NOT_REFUNDABLE',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
    this.name = 'PaymentRequestNotRefundableError';
  }
}

export class RefundExceedsRefundableDomainError extends BookingPaymentRefundDomainError {
  constructor(refundAmountCents: number, refundableAmountCents: number) {
    super(
      `Refund amount ${refundAmountCents} exceeds refundable amount ${refundableAmountCents}`,
      'REFUND_EXCEEDS_REFUNDABLE',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
    this.name = 'RefundExceedsRefundableDomainError';
  }
}

export class MissingStripeChargeError extends BookingPaymentRefundDomainError {
  constructor() {
    super(
      'Payment request has no Stripe charge or payment intent to refund',
      'MISSING_STRIPE_CHARGE',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
    this.name = 'MissingStripeChargeError';
  }
}

export class DepositRefundNotSupportedError extends BookingPaymentRefundDomainError {
  constructor() {
    super(
      'Deposit refunds are not supported in this MVP',
      'DEPOSIT_REFUND_NOT_SUPPORTED',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
    this.name = 'DepositRefundNotSupportedError';
  }
}
