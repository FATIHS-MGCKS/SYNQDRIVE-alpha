import { HttpException, HttpStatus } from '@nestjs/common';

export type PaymentReconciliationErrorCode =
  | 'RECONCILIATION_EVENT_NOT_FOUND'
  | 'RECONCILIATION_ORG_MISMATCH'
  | 'RECONCILIATION_ACCOUNT_MISMATCH'
  | 'RECONCILIATION_PAYMENT_REQUEST_NOT_FOUND'
  | 'RECONCILIATION_AMOUNT_MISMATCH'
  | 'RECONCILIATION_CURRENCY_MISMATCH'
  | 'RECONCILIATION_LIVEMODE_MISMATCH'
  | 'RECONCILIATION_INVALID_CONTEXT'
  | 'RECONCILIATION_STATUS_CONFLICT';

export class PaymentReconciliationDomainError extends HttpException {
  constructor(
    message: string,
    public readonly code: PaymentReconciliationErrorCode,
    status: HttpStatus = HttpStatus.UNPROCESSABLE_ENTITY,
  ) {
    super({ message, code }, status);
    this.name = 'PaymentReconciliationDomainError';
  }
}

export class PaymentReconciliationOrgMismatchError extends PaymentReconciliationDomainError {
  constructor() {
    super('Webhook organization does not match payment request metadata', 'RECONCILIATION_ORG_MISMATCH');
    this.name = 'PaymentReconciliationOrgMismatchError';
  }
}

export class PaymentReconciliationAmountMismatchError extends PaymentReconciliationDomainError {
  constructor(expected: number, actual: number) {
    super(
      `Payment amount mismatch: expected ${expected}, got ${actual}`,
      'RECONCILIATION_AMOUNT_MISMATCH',
    );
    this.name = 'PaymentReconciliationAmountMismatchError';
  }
}

export class PaymentReconciliationCurrencyMismatchError extends PaymentReconciliationDomainError {
  constructor(expected: string, actual: string) {
    super(
      `Payment currency mismatch: expected ${expected}, got ${actual}`,
      'RECONCILIATION_CURRENCY_MISMATCH',
    );
    this.name = 'PaymentReconciliationCurrencyMismatchError';
  }
}
