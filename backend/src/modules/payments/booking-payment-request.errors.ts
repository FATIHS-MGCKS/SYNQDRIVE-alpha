import { HttpException, HttpStatus } from '@nestjs/common';

export type BookingPaymentRequestErrorCode =
  | 'PAYMENTS_FEATURE_DISABLED'
  | 'PAYMENT_REQUEST_FORBIDDEN'
  | 'BOOKING_NOT_FOUND'
  | 'CUSTOMER_NOT_FOUND'
  | 'MISSING_RECIPIENT_EMAIL'
  | 'MISSING_PRICE_SNAPSHOT'
  | 'MISSING_INVOICE'
  | 'SNAPSHOT_INVOICE_CONFLICT'
  | 'CURRENCY_MISMATCH'
  | 'CONNECT_ACCOUNT_NOT_READY'
  | 'ACTIVE_PAYMENT_REQUEST_EXISTS'
  | 'ZERO_PAYMENT_AMOUNT'
  | 'IDEMPOTENCY_KEY_REQUIRED';

export class BookingPaymentRequestDomainError extends HttpException {
  constructor(
    message: string,
    public readonly code: BookingPaymentRequestErrorCode,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ message, code }, status);
    this.name = 'BookingPaymentRequestDomainError';
  }
}

export class MissingRecipientEmailError extends BookingPaymentRequestDomainError {
  constructor() {
    super('Recipient email is required for payment requests', 'MISSING_RECIPIENT_EMAIL');
    this.name = 'MissingRecipientEmailError';
  }
}

export class MissingInvoiceError extends BookingPaymentRequestDomainError {
  constructor(bookingId: string) {
    super(
      `No payable booking invoice found for booking ${bookingId}`,
      'MISSING_INVOICE',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
    this.name = 'MissingInvoiceError';
  }
}

export class SnapshotInvoiceConflictError extends BookingPaymentRequestDomainError {
  constructor(detail: string) {
    super(detail, 'SNAPSHOT_INVOICE_CONFLICT', HttpStatus.CONFLICT);
    this.name = 'SnapshotInvoiceConflictError';
  }
}

export class ConnectAccountNotReadyError extends BookingPaymentRequestDomainError {
  constructor() {
    super(
      'Stripe connected account is not ready to accept customer payments',
      'CONNECT_ACCOUNT_NOT_READY',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
    this.name = 'ConnectAccountNotReadyError';
  }
}

export class ActivePaymentRequestExistsError extends BookingPaymentRequestDomainError {
  constructor(invoiceId: string) {
    super(
      `An active rental payment request already exists for invoice ${invoiceId}`,
      'ACTIVE_PAYMENT_REQUEST_EXISTS',
      HttpStatus.CONFLICT,
    );
    this.name = 'ActivePaymentRequestExistsError';
  }
}

export class IdempotencyKeyRequiredError extends BookingPaymentRequestDomainError {
  constructor() {
    super('Idempotency-Key header is required', 'IDEMPOTENCY_KEY_REQUIRED', HttpStatus.BAD_REQUEST);
    this.name = 'IdempotencyKeyRequiredError';
  }
}

export class ZeroPaymentAmountError extends BookingPaymentRequestDomainError {
  constructor() {
    super('Payment amount must be greater than zero', 'ZERO_PAYMENT_AMOUNT');
    this.name = 'ZeroPaymentAmountError';
  }
}
