import { DocumentExtractionStage } from '@prisma/client';

export const MISTRAL_OCR_ERROR_CODES = {
  OCR_NOT_CONFIGURED: 'OCR_NOT_CONFIGURED',
  OCR_UNSUPPORTED_MIME: 'OCR_UNSUPPORTED_MIME',
  OCR_FILE_TOO_LARGE: 'OCR_FILE_TOO_LARGE',
  OCR_TIMEOUT: 'OCR_TIMEOUT',
  OCR_RATE_LIMITED: 'OCR_RATE_LIMITED',
  OCR_PROVIDER_UNAVAILABLE: 'OCR_PROVIDER_UNAVAILABLE',
  OCR_INVALID_RESPONSE: 'OCR_INVALID_RESPONSE',
  OCR_EMPTY_RESULT: 'OCR_EMPTY_RESULT',
  OCR_AUTHENTICATION_FAILED: 'OCR_AUTHENTICATION_FAILED',
  OCR_UNKNOWN_ERROR: 'OCR_UNKNOWN_ERROR',
} as const;

export type MistralOcrErrorCode = (typeof MISTRAL_OCR_ERROR_CODES)[keyof typeof MISTRAL_OCR_ERROR_CODES];

/**
 * Safe, typed OCR domain error — `safeMessage` is UI-safe; `cause` is server-log only.
 */
export class MistralOcrError extends Error {
  readonly code: MistralOcrErrorCode;
  readonly safeMessage: string;
  readonly retryable: boolean;
  readonly stage: DocumentExtractionStage = 'OCR';
  readonly cause?: unknown;

  constructor(params: {
    code: MistralOcrErrorCode;
    safeMessage: string;
    retryable: boolean;
    cause?: unknown;
  }) {
    super(params.safeMessage);
    this.name = 'MistralOcrError';
    this.code = params.code;
    this.safeMessage = params.safeMessage;
    this.retryable = params.retryable;
    this.cause = params.cause;
  }
}
