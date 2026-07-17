import { describe, expect, it } from 'vitest';
import {
  DocumentUploadRateLimitedError,
  parseUploadRateLimitError,
} from './document-upload-rate-limit';

describe('document-upload-rate-limit', () => {
  it('parses structured 429 upload rate limit responses', () => {
    const error = parseUploadRateLimitError({
      statusCode: 429,
      errorCode: 'DOCUMENT_UPLOAD_RATE_LIMITED',
      scope: 'organization',
      reason: 'count',
      retryAfterSeconds: 42,
      windowMs: 60_000,
      limit: 40,
      message: 'Upload count limit reached for organization (1 min window). Retry in 42s.',
    });

    expect(error).toBeInstanceOf(DocumentUploadRateLimitedError);
    expect(error?.payload.scope).toBe('organization');
    expect(error?.payload.retryAfterSeconds).toBe(42);
  });
});
