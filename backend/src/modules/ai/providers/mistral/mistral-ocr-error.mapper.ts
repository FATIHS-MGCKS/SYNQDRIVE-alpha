import { MistralError } from '@mistralai/mistralai/models/errors/mistralerror.js';
import {
  ConnectionError,
  RequestTimeoutError,
} from '@mistralai/mistralai/models/errors/httpclienterrors.js';
import { ResponseValidationError } from '@mistralai/mistralai/models/errors/responsevalidationerror.js';
import { SDKValidationError } from '@mistralai/mistralai/models/errors/sdkvalidationerror.js';
import {
  MISTRAL_OCR_ERROR_CODES,
  MistralOcrError,
  MistralOcrErrorCode,
} from './mistral-ocr.errors';

export function redactOcrLogText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9]+/gi, 'sk-[redacted]')
    .replace(/data:[^;]+;base64,[A-Za-z0-9+/=]+/gi, 'data:[mime];base64,[redacted]')
    .slice(0, 300);
}

function redactSensitiveText(value: string): string {
  return redactOcrLogText(value);
}

function mistralOcrError(
  code: MistralOcrErrorCode,
  safeMessage: string,
  retryable: boolean,
  cause?: unknown,
): MistralOcrError {
  return new MistralOcrError({ code, safeMessage, retryable, cause });
}

export function mapMistralOcrProviderError(err: unknown): MistralOcrError {
  if (err instanceof MistralOcrError) {
    return err;
  }

  if (err instanceof RequestTimeoutError) {
    return mistralOcrError(
      MISTRAL_OCR_ERROR_CODES.OCR_TIMEOUT,
      'OCR request timed out — try again later',
      true,
      err,
    );
  }

  if (err instanceof ConnectionError) {
    return mistralOcrError(
      MISTRAL_OCR_ERROR_CODES.OCR_PROVIDER_UNAVAILABLE,
      'OCR provider is temporarily unavailable',
      true,
      err,
    );
  }

  if (err instanceof ResponseValidationError || err instanceof SDKValidationError) {
    return mistralOcrError(
      MISTRAL_OCR_ERROR_CODES.OCR_INVALID_RESPONSE,
      'OCR provider returned an invalid response',
      false,
      err,
    );
  }

  if (err instanceof MistralError) {
    const status = err.statusCode;
    if (status === 401 || status === 403) {
      return mistralOcrError(
        MISTRAL_OCR_ERROR_CODES.OCR_AUTHENTICATION_FAILED,
        'OCR authentication failed — check server configuration',
        false,
        err,
      );
    }
    if (status === 429) {
      return mistralOcrError(
        MISTRAL_OCR_ERROR_CODES.OCR_RATE_LIMITED,
        'OCR rate limit reached — try again later',
        true,
        err,
      );
    }
    if (status >= 500) {
      return mistralOcrError(
        MISTRAL_OCR_ERROR_CODES.OCR_PROVIDER_UNAVAILABLE,
        'OCR provider is temporarily unavailable',
        true,
        err,
      );
    }
    if (status === 400 || status === 422) {
      return mistralOcrError(
        MISTRAL_OCR_ERROR_CODES.OCR_INVALID_RESPONSE,
        'OCR request was rejected — check document format',
        false,
        err,
      );
    }
  }

  const message =
    err instanceof Error ? redactSensitiveText(err.message) : 'OCR processing failed';
  return mistralOcrError(
    MISTRAL_OCR_ERROR_CODES.OCR_UNKNOWN_ERROR,
    message || 'OCR processing failed',
    false,
    err,
  );
}
