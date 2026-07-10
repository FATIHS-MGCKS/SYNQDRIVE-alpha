/** Canonical AI document upload constraints — single source of truth for backend. */

export const DOCUMENT_UPLOAD_MAX_MB_DEFAULT = 10;

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'text/plain',
] as const;

export type AllowedDocumentMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const ALLOWED_EXTENSIONS = [
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.txt',
] as const;

export const DOCUMENT_UPLOAD_ACCEPT_ATTR = ALLOWED_EXTENSIONS.join(',');

export function resolveDocumentUploadMaxMb(envValue?: string): number {
  const parsed = parseInt(envValue ?? process.env.DOCUMENT_UPLOAD_MAX_MB ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DOCUMENT_UPLOAD_MAX_MB_DEFAULT;
}

export function resolveMaxUploadBytes(maxUploadMb?: number): number {
  const mb = maxUploadMb ?? resolveDocumentUploadMaxMb();
  return Math.max(1, Math.round(mb * 1024 * 1024));
}

export function isAllowedMimeType(mime: string | undefined): mime is AllowedDocumentMimeType {
  return !!mime && (ALLOWED_MIME_TYPES as readonly string[]).includes(mime.toLowerCase());
}

/** Harmless browser/client MIME aliases mapped to canonical values. */
export const MIME_ALIASES: Record<string, AllowedDocumentMimeType> = {
  'image/jpg': 'image/jpeg',
  'application/x-pdf': 'application/pdf',
};

export function normalizeClientMimeType(mime: string | undefined): string {
  const lower = (mime ?? '').trim().toLowerCase();
  return MIME_ALIASES[lower] ?? lower;
}
