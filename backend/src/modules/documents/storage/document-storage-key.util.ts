import { BadRequestException } from '@nestjs/common';
import { basename, extname, resolve, sep } from 'path';
import { randomUUID } from 'crypto';

export interface BuildDocumentObjectKeyInput {
  organizationId: string;
  bookingId?: string | null;
  documentType: string;
  originalName: string;
  /** `organizations` for clean storage or `quarantine/organizations` for quarantine. */
  keyPrefix: string;
  now?: Date;
}

/**
 * Builds a tenant-scoped, server-generated object key. Client paths and raw
 * filenames are never used as key segments — only a sanitised suffix.
 */
export function buildDocumentObjectKey(input: BuildDocumentObjectKeyInput): string {
  const orgSeg = safeStorageSegment(input.organizationId);
  const typeSeg = safeStorageSegment(input.documentType) || 'document';
  if (!orgSeg) {
    throw new BadRequestException('organizationId is required for storage');
  }

  const now = input.now ?? new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const safeName = sanitizeDocumentFileName(input.originalName);

  const bookingSeg = input.bookingId ? safeStorageSegment(input.bookingId) : '';
  const scope = bookingSeg
    ? ['bookings', bookingSeg, typeSeg]
    : ['legal', typeSeg];

  return [input.keyPrefix, orgSeg, ...scope, yyyy, mm, `${randomUUID()}-${safeName}`].join('/');
}

export function safeStorageSegment(value: string): string {
  if (!value) return '';
  return basename(String(value)).replace(/[^a-zA-Z0-9_-]/g, '');
}

export function sanitizeDocumentFileName(originalName: string): string {
  const base = basename(String(originalName || 'document'));
  const ext = extname(base).toLowerCase().replace(/[^a-z0-9.]/g, '');
  const stem =
    base
      .slice(0, base.length - extname(base).length)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 60) || 'document';
  const safeExt = ext && ext.length <= 6 ? ext : '';
  return `${stem}${safeExt}`;
}

export function assertSafeDocumentObjectKey(objectKey: string): void {
  if (typeof objectKey !== 'string' || objectKey.length === 0) {
    throw new BadRequestException('Invalid object key');
  }
  if (objectKey.includes('\0') || objectKey.includes('..')) {
    throw new BadRequestException('Invalid object key');
  }
  const normalized = objectKey.replace(/\\/g, '/').replace(/^\/+/, '');
  if (/^[a-zA-Z]:/.test(normalized)) {
    throw new BadRequestException('Invalid object key');
  }
}

export function resolveLocalObjectKeyPath(baseDir: string, objectKey: string): string {
  assertSafeDocumentObjectKey(objectKey);
  const normalized = objectKey.replace(/\\/g, '/').replace(/^\/+/, '');
  const abs = resolve(baseDir, normalized);
  const baseWithSep = baseDir.endsWith(sep) ? baseDir : baseDir + sep;
  if (abs !== baseDir && !abs.startsWith(baseWithSep)) {
    throw new BadRequestException('Invalid object key (path traversal)');
  }
  return abs;
}
