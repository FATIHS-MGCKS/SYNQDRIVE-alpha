import { HttpException, HttpStatus } from '@nestjs/common';

export type StripeCheckoutErrorCode =
  | 'CHECKOUT_IDEMPOTENCY_KEY_REQUIRED'
  | 'PAYMENT_REQUEST_NOT_CHECKOUT_ELIGIBLE'
  | 'CHECKOUT_SESSION_ALREADY_ACTIVE'
  | 'CHECKOUT_IDEMPOTENCY_CONFLICT'
  | 'CHECKOUT_CURRENCY_UNSUPPORTED'
  | 'CONNECT_ACCOUNT_NOT_READY'
  | 'CONNECT_ACCOUNT_RESTRICTED'
  | 'STRIPE_MODE_MISMATCH'
  | 'STRIPE_CHECKOUT_FAILED';

export class StripeCheckoutDomainError extends HttpException {
  constructor(
    message: string,
    public readonly code: StripeCheckoutErrorCode,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ message, code }, status);
    this.name = 'StripeCheckoutDomainError';
  }
}

export class CheckoutIdempotencyKeyRequiredError extends StripeCheckoutDomainError {
  constructor() {
    super('Idempotency-Key header is required for checkout session creation', 'CHECKOUT_IDEMPOTENCY_KEY_REQUIRED');
    this.name = 'CheckoutIdempotencyKeyRequiredError';
  }
}

export class PaymentRequestNotCheckoutEligibleError extends StripeCheckoutDomainError {
  constructor(status: string) {
    super(
      `Payment request in status ${status} is not eligible for checkout session creation`,
      'PAYMENT_REQUEST_NOT_CHECKOUT_ELIGIBLE',
      HttpStatus.CONFLICT,
    );
    this.name = 'PaymentRequestNotCheckoutEligibleError';
  }
}

export class CheckoutIdempotencyConflictError extends StripeCheckoutDomainError {
  constructor() {
    super(
      'Checkout idempotency key is already used by another payment request',
      'CHECKOUT_IDEMPOTENCY_CONFLICT',
      HttpStatus.CONFLICT,
    );
    this.name = 'CheckoutIdempotencyConflictError';
  }
}

export class CheckoutCurrencyUnsupportedError extends StripeCheckoutDomainError {
  constructor(currency: string) {
    super(
      `Currency ${currency} is not supported for Stripe checkout`,
      'CHECKOUT_CURRENCY_UNSUPPORTED',
    );
    this.name = 'CheckoutCurrencyUnsupportedError';
  }
}

export class StripeCheckoutFailedError extends StripeCheckoutDomainError {
  constructor(detail: string) {
    super(detail, 'STRIPE_CHECKOUT_FAILED', HttpStatus.BAD_GATEWAY);
    this.name = 'StripeCheckoutFailedError';
  }
}
