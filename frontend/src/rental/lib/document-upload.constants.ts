/** Canonical document upload limits — keep aligned with backend metadata endpoint. */

export const DOCUMENT_UPLOAD_MAX_MB = 10;
export const DOCUMENT_UPLOAD_MAX_BYTES = DOCUMENT_UPLOAD_MAX_MB * 1024 * 1024;

export const DOCUMENT_UPLOAD_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'text/plain',
] as const;

export const DOCUMENT_UPLOAD_EXTENSIONS = [
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.txt',
] as const;

export const DOCUMENT_UPLOAD_ACCEPT_ATTR = DOCUMENT_UPLOAD_EXTENSIONS.join(',');
