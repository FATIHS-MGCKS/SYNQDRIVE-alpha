export const DOCUMENT_ACTION_ERROR_CODES = {
  PLAN_NOT_CONFIRMED: 'PLAN_NOT_CONFIRMED',
  PLAN_INVALIDATED: 'PLAN_INVALIDATED',
  PLAN_VERSION_MISMATCH: 'PLAN_VERSION_MISMATCH',
  PLAN_FINGERPRINT_MISMATCH: 'PLAN_FINGERPRINT_MISMATCH',
  PLAN_BLOCKED: 'PLAN_BLOCKED',
  PLAN_LOCKED: 'PLAN_LOCKED',
  EXECUTOR_NOT_FOUND: 'EXECUTOR_NOT_FOUND',
  REQUIRED_ACTION_FAILED: 'REQUIRED_ACTION_FAILED',
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',
  TECHNICAL_FAILURE: 'TECHNICAL_FAILURE',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
} as const;

export type DocumentActionErrorCode =
  (typeof DOCUMENT_ACTION_ERROR_CODES)[keyof typeof DOCUMENT_ACTION_ERROR_CODES];

export class DocumentActionBusinessError extends Error {
  readonly name = 'DocumentActionBusinessError';

  constructor(
    public readonly code: DocumentActionErrorCode | string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export class DocumentActionTechnicalError extends Error {
  readonly name = 'DocumentActionTechnicalError';

  constructor(
    public readonly code: DocumentActionErrorCode | string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
  }
}

export class DocumentActionPlanError extends Error {
  readonly name = 'DocumentActionPlanError';

  constructor(
    public readonly code: DocumentActionErrorCode | string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function isDocumentActionError(
  error: unknown,
): error is DocumentActionBusinessError | DocumentActionTechnicalError | DocumentActionPlanError {
  return (
    error instanceof DocumentActionBusinessError ||
    error instanceof DocumentActionTechnicalError ||
    error instanceof DocumentActionPlanError
  );
}
