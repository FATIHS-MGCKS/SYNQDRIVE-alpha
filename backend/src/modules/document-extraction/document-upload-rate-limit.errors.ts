import { HttpException, HttpStatus } from '@nestjs/common';
import type { DocumentUploadRateLimitViolation } from './document-upload-rate-limit.types';
import { DOCUMENT_UPLOAD_RATE_LIMIT_ERROR_CODE } from './document-upload-rate-limit.types';

export class DocumentUploadRateLimitedException extends HttpException {
  constructor(violation: DocumentUploadRateLimitViolation) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        errorCode: DOCUMENT_UPLOAD_RATE_LIMIT_ERROR_CODE,
        scope: violation.scope,
        reason: violation.reason,
        retryAfterSeconds: violation.retryAfterSeconds,
        windowMs: violation.windowMs,
        limit: violation.limit,
        message: buildUploadRateLimitMessage(violation),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

function buildUploadRateLimitMessage(violation: DocumentUploadRateLimitViolation): string {
  const windowMinutes = Math.max(1, Math.round(violation.windowMs / 60_000));
  if (violation.reason === 'bytes') {
    return `Upload volume limit reached for ${violation.scope} (${windowMinutes} min window). Retry in ${violation.retryAfterSeconds}s.`;
  }
  return `Upload count limit reached for ${violation.scope} (${windowMinutes} min window). Retry in ${violation.retryAfterSeconds}s.`;
}
