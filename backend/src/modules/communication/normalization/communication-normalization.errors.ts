export enum CommunicationNormalizationErrorCode {
  INVALID_NORMALIZED_INPUT = 'INVALID_NORMALIZED_INPUT',
  TENANT_CONTEXT_REJECTED = 'TENANT_CONTEXT_REJECTED',
  CHANNEL_MISMATCH = 'CHANNEL_MISMATCH',
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
  PROJECTION_FAILURE = 'PROJECTION_FAILURE',
  EMAIL_CONVERSATION_DEFERRED = 'EMAIL_CONVERSATION_DEFERRED',
}

export class CommunicationNormalizationError extends Error {
  readonly code: CommunicationNormalizationErrorCode;

  constructor(code: CommunicationNormalizationErrorCode, message: string) {
    super(message);
    this.name = 'CommunicationNormalizationError';
    this.code = code;
  }
}
