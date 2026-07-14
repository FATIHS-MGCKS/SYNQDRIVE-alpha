export class PaymentFeeDomainError extends Error {
  constructor(
    message: string,
    public readonly code: PaymentFeeErrorCode,
  ) {
    super(message);
    this.name = 'PaymentFeeDomainError';
  }
}

export type PaymentFeeErrorCode =
  | 'MISSING_PRICE_SNAPSHOT'
  | 'INVALID_CURRENCY'
  | 'NEGATIVE_COMMISSIONABLE'
  | 'ZERO_PAYMENT_AMOUNT'
  | 'REFUND_EXCEEDS_PAID'
  | 'CURRENCY_MISMATCH';

export class MissingPriceSnapshotError extends PaymentFeeDomainError {
  constructor(bookingId: string) {
    super(`No BookingPriceSnapshot found for booking ${bookingId}`, 'MISSING_PRICE_SNAPSHOT');
    this.name = 'MissingPriceSnapshotError';
  }
}

export class InvalidCurrencyError extends PaymentFeeDomainError {
  constructor(currency: string) {
    super(`Invalid or unsupported currency: ${currency}`, 'INVALID_CURRENCY');
    this.name = 'InvalidCurrencyError';
  }
}

export class CurrencyMismatchError extends PaymentFeeDomainError {
  constructor(expected: string, actual: string) {
    super(`Currency mismatch: expected ${expected}, got ${actual}`, 'CURRENCY_MISMATCH');
    this.name = 'CurrencyMismatchError';
  }
}

export class NegativeCommissionableError extends PaymentFeeDomainError {
  constructor(amountCents: number) {
    super(`Commissionable amount cannot be negative: ${amountCents}`, 'NEGATIVE_COMMISSIONABLE');
    this.name = 'NegativeCommissionableError';
  }
}

export class RefundExceedsPaidError extends PaymentFeeDomainError {
  constructor(refundAmountCents: number, paidAmountCents: number) {
    super(
      `Refund ${refundAmountCents} exceeds paid amount ${paidAmountCents}`,
      'REFUND_EXCEEDS_PAID',
    );
    this.name = 'RefundExceedsPaidError';
  }
}
