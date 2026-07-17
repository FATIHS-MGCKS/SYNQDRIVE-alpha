import type { DocumentUploadRateLimitScope } from '../rental/lib/document-extraction.types';

export const DOCUMENT_UPLOAD_RATE_LIMIT_ERROR_CODE = 'DOCUMENT_UPLOAD_RATE_LIMITED';

export interface DocumentUploadRateLimitedPayload {
  statusCode: number;
  errorCode: string;
  scope: DocumentUploadRateLimitScope;
  reason: 'count' | 'bytes';
  retryAfterSeconds: number;
  windowMs: number;
  limit: number;
  message: string;
}

export class DocumentUploadRateLimitedError extends Error {
  readonly payload: DocumentUploadRateLimitedPayload;

  constructor(payload: DocumentUploadRateLimitedPayload) {
    super(payload.message);
    this.name = 'DocumentUploadRateLimitedError';
    this.payload = payload;
  }
}

export function parseUploadRateLimitError(body: unknown): DocumentUploadRateLimitedError | null {
  if (!body || typeof body !== 'object') return null;
  const row = body as Record<string, unknown>;
  const nested = row.message && typeof row.message === 'object' ? (row.message as Record<string, unknown>) : row;
  const errorCode = String(nested.errorCode ?? row.errorCode ?? '');
  if (errorCode !== DOCUMENT_UPLOAD_RATE_LIMIT_ERROR_CODE) return null;

  return new DocumentUploadRateLimitedError({
    statusCode: Number(nested.statusCode ?? row.statusCode ?? 429),
    errorCode,
    scope: String(nested.scope ?? 'organization') as DocumentUploadRateLimitScope,
    reason: nested.reason === 'bytes' ? 'bytes' : 'count',
    retryAfterSeconds: Number(nested.retryAfterSeconds ?? 60),
    windowMs: Number(nested.windowMs ?? 60_000),
    limit: Number(nested.limit ?? 0),
    message: String(
      typeof nested.message === 'string'
        ? nested.message
        : 'Upload-Limit erreicht. Bitte später erneut versuchen.',
    ),
  });
}
