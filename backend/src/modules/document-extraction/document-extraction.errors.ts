import { DocumentExtractionErrorPhase } from '@prisma/client';
import { DOCUMENT_EXTRACTION_ERROR_CODES } from './document-extraction-lifecycle.util';
import { MistralOcrError } from '@modules/ai/providers/mistral/mistral-ocr.errors';

/**
 * Typed, user-safe errors for the extraction pipeline. Their messages are safe
 * to surface to the UI (they never contain document contents or secrets).
 */

export const DOCUMENT_PIPELINE_ERROR_CODES = {
  FILE_EMPTY: 'FILE_EMPTY',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  MIME_UNSUPPORTED: 'MIME_UNSUPPORTED',
  MIME_MISMATCH: 'MIME_MISMATCH',
  FILE_CORRUPTED: 'FILE_CORRUPTED',
  PDF_PASSWORD_REQUIRED: 'PDF_PASSWORD_REQUIRED',
  FILE_TOO_COMPLEX: 'FILE_TOO_COMPLEX',
  FILE_TOO_MANY_PAGES: 'FILE_TOO_MANY_PAGES',
  FILE_IDENTIFICATION_TIMEOUT: 'FILE_IDENTIFICATION_TIMEOUT',
  PDF_TEXT_EXTRACTION_FAILED: 'PDF_TEXT_EXTRACTION_FAILED',
  OCR_FAILED: 'OCR_FAILED',
  OCR_EMPTY_RESULT: 'OCR_EMPTY_RESULT',
  OCR_NOT_CONFIGURED: 'OCR_NOT_CONFIGURED',
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',
} as const;

export type DocumentPipelineErrorCode =
  (typeof DOCUMENT_PIPELINE_ERROR_CODES)[keyof typeof DOCUMENT_PIPELINE_ERROR_CODES];

/** Unified domain error for document upload / queue / worker processing. */
export class DocumentExtractionPipelineError extends Error {
  readonly code: DocumentPipelineErrorCode | string;
  readonly safeMessage: string;
  readonly retryable: boolean;
  readonly stage: DocumentExtractionErrorPhase;
  readonly cause?: unknown;
  readonly providerStatusCode?: number;

  constructor(params: {
    code: DocumentPipelineErrorCode | string;
    safeMessage: string;
    retryable?: boolean;
    stage?: DocumentExtractionErrorPhase;
    cause?: unknown;
    providerStatusCode?: number;
  }) {
    super(params.safeMessage);
    this.name = 'DocumentExtractionPipelineError';
    this.code = params.code;
    this.safeMessage = params.safeMessage;
    this.retryable = params.retryable ?? false;
    this.stage = params.stage ?? 'OCR';
    this.cause = params.cause;
    this.providerStatusCode = params.providerStatusCode;
  }
}

/** Alias used by queue/worker documentation — same class as DocumentExtractionPipelineError. */
export type DocumentProcessingError = DocumentExtractionPipelineError;

export function isDocumentProcessingError(err: unknown): err is DocumentProcessingError {
  return err instanceof DocumentExtractionPipelineError;
}

export function normalizeDocumentProcessingError(
  err: unknown,
  fallbackStage: DocumentExtractionErrorPhase = 'EXTRACTION',
): DocumentProcessingError {
  if (err instanceof DocumentExtractionPipelineError) {
    return err;
  }
  if (err instanceof MistralOcrError) {
    return new DocumentExtractionPipelineError({
      code: DOCUMENT_PIPELINE_ERROR_CODES.OCR_FAILED,
      safeMessage: err.safeMessage,
      retryable: err.retryable,
      stage: 'OCR',
      cause: err,
    });
  }
  const raw = err instanceof Error ? err.message : String(err);
  const safeMessage = raw
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9]+/gi, 'sk-[redacted]')
    .slice(0, 300);
  return new DocumentExtractionPipelineError({
    code: DOCUMENT_EXTRACTION_ERROR_CODES.UNKNOWN,
    safeMessage: safeMessage || 'Document processing failed',
    retryable: isLikelyTransientMessage(safeMessage),
    stage: fallbackStage,
    cause: err,
  });
}

export function mapClassificationFailure(error: string | undefined): DocumentProcessingError {
  const msg = (error ?? 'Document classification failed').slice(0, 300);
  return new DocumentExtractionPipelineError({
    code: DOCUMENT_EXTRACTION_ERROR_CODES.CLASSIFICATION_FAILED,
    safeMessage: msg,
    retryable: isLikelyTransientMessage(msg),
    stage: 'CLASSIFICATION',
  });
}

export function mapAiExtractionFailure(error: string | undefined): DocumentProcessingError {
  const msg = (error ?? 'AI extraction failed').slice(0, 300);
  return new DocumentExtractionPipelineError({
    code: DOCUMENT_EXTRACTION_ERROR_CODES.EXTRACTION_FAILED,
    safeMessage: msg,
    retryable: isLikelyTransientMessage(msg),
    stage: 'EXTRACTION',
  });
}

export function mapStorageReadFailure(cause: unknown): DocumentProcessingError {
  return new DocumentExtractionPipelineError({
    code: DOCUMENT_EXTRACTION_ERROR_CODES.FILE_CORRUPTED,
    safeMessage: 'Could not read the stored document — try again later',
    retryable: true,
    stage: 'STORAGE',
    cause,
  });
}

function isLikelyTransientMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('rate limit') ||
    lower.includes('429') ||
    lower.includes('503') ||
    lower.includes('502') ||
    lower.includes('500') ||
    lower.includes('temporarily unavailable') ||
    lower.includes('econnreset') ||
    lower.includes('econnrefused') ||
    lower.includes('network') ||
    lower.includes('redis') ||
    lower.includes('queue')
  );
}

/** @deprecated Use DocumentExtractionPipelineError — kept for backward-compatible instanceof checks in tests. */
export class OcrNotConfiguredError extends DocumentExtractionPipelineError {
  constructor(message = 'Image OCR is not configured yet') {
    super({
      code: DOCUMENT_PIPELINE_ERROR_CODES.OCR_NOT_CONFIGURED,
      safeMessage: message,
      retryable: false,
      stage: 'OCR',
    });
    this.name = 'OcrNotConfiguredError';
  }
}

/** Thrown when the uploaded file type is not supported at all. */
export class UnsupportedFileTypeError extends DocumentExtractionPipelineError {
  constructor(message = 'Unsupported file type') {
    super({
      code: DOCUMENT_PIPELINE_ERROR_CODES.UNSUPPORTED_FILE_TYPE,
      safeMessage: message,
      retryable: false,
      stage: 'UPLOAD',
    });
    this.name = 'UnsupportedFileTypeError';
  }
}

/** Thrown when the AI extraction layer is unavailable/disabled. */
export class AgentUnavailableError extends Error {
  readonly code = 'AGENT_UNAVAILABLE';
  constructor(message = 'AI extraction agent is not available') {
    super(message);
    this.name = 'AgentUnavailableError';
  }
}
