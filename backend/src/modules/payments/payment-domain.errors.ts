import { BookingPaymentRequestStatus } from '@prisma/client';

export class PaymentDomainError extends Error {
  constructor(
    message: string,
    public readonly code: PaymentDomainErrorCode,
  ) {
    super(message);
    this.name = 'PaymentDomainError';
  }
}

export type PaymentDomainErrorCode =
  | 'INVALID_STATUS_TRANSITION'
  | 'PAID_WITHOUT_CONFIRMED_CHARGE'
  | 'REFUND_WITHOUT_PRIOR_PAYMENT'
  | 'REFUND_EXCEEDS_REFUNDABLE'
  | 'CANCEL_AFTER_FULL_PAYMENT'
  | 'RESET_PAID_STATUS'
  | 'MISSING_REFUND_AMOUNT'
  | 'PAYMENT_REQUEST_NOT_FOUND';

export class PaymentStatusTransitionError extends PaymentDomainError {
  constructor(
    public readonly from: BookingPaymentRequestStatus,
    public readonly to: BookingPaymentRequestStatus,
    message?: string,
  ) {
    super(
      message ?? `Invalid payment request status transition: ${from} → ${to}`,
      'INVALID_STATUS_TRANSITION',
    );
    this.name = 'PaymentStatusTransitionError';
  }
}

export class PaidWithoutConfirmedChargeError extends PaymentDomainError {
  constructor() {
    super(
      'Cannot mark payment request as PAID without a succeeded CHARGE ledger transaction',
      'PAID_WITHOUT_CONFIRMED_CHARGE',
    );
    this.name = 'PaidWithoutConfirmedChargeError';
  }
}

export class RefundWithoutPriorPaymentError extends PaymentDomainError {
  constructor() {
    super(
      'Cannot refund a payment request without a prior successful charge',
      'REFUND_WITHOUT_PRIOR_PAYMENT',
    );
    this.name = 'RefundWithoutPriorPaymentError';
  }
}

export class RefundExceedsRefundableError extends PaymentDomainError {
  constructor(
    public readonly refundAmountCents: number,
    public readonly refundableAmountCents: number,
  ) {
    super(
      `Refund amount ${refundAmountCents} exceeds refundable amount ${refundableAmountCents}`,
      'REFUND_EXCEEDS_REFUNDABLE',
    );
    this.name = 'RefundExceedsRefundableError';
  }
}

export class CancelAfterFullPaymentError extends PaymentDomainError {
  constructor() {
    super(
      'Cannot cancel a payment request that has been fully paid',
      'CANCEL_AFTER_FULL_PAYMENT',
    );
    this.name = 'CancelAfterFullPaymentError';
  }
}

export class ResetPaidStatusError extends PaymentDomainError {
  constructor(
    public readonly from: BookingPaymentRequestStatus,
    public readonly to: BookingPaymentRequestStatus,
  ) {
    super(
      `Cannot reset paid payment request from ${from} to ${to}`,
      'RESET_PAID_STATUS',
    );
    this.name = 'ResetPaidStatusError';
  }
}

export class MissingRefundAmountError extends PaymentDomainError {
  constructor() {
    super(
      'refundAmountCents is required when transitioning to a refund status',
      'MISSING_REFUND_AMOUNT',
    );
    this.name = 'MissingRefundAmountError';
  }
}
