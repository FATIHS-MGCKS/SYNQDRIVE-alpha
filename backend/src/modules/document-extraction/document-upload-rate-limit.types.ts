export const DOCUMENT_UPLOAD_RATE_LIMIT_SCOPES = [
  'organization',
  'user',
  'ip',
] as const;

export type DocumentUploadRateLimitScope =
  (typeof DOCUMENT_UPLOAD_RATE_LIMIT_SCOPES)[number];

export const DOCUMENT_UPLOAD_RATE_LIMIT_REASONS = ['count', 'bytes'] as const;

export type DocumentUploadRateLimitReason =
  (typeof DOCUMENT_UPLOAD_RATE_LIMIT_REASONS)[number];

export const DOCUMENT_UPLOAD_RATE_LIMIT_ERROR_CODE = 'DOCUMENT_UPLOAD_RATE_LIMITED';

export interface AssertDocumentUploadRateLimitInput {
  organizationId: string;
  userId?: string | null;
  clientIp?: string | null;
  uploadSource?: string | null;
  platformRole?: string | null;
  sizeBytes: number;
}

export interface DocumentUploadRateLimitResult {
  allowed: true;
  windowMs: number;
  limitMultiplier: number;
}

export interface DocumentUploadRateLimitViolation {
  allowed: false;
  scope: DocumentUploadRateLimitScope;
  reason: DocumentUploadRateLimitReason;
  retryAfterSeconds: number;
  windowMs: number;
  limit: number;
}

export type DocumentUploadRateLimitDecision =
  | DocumentUploadRateLimitResult
  | DocumentUploadRateLimitViolation;
