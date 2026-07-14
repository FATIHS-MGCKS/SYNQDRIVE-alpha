import { Prisma } from '@prisma/client';
import {
  DOCUMENT_GENERATION_STATUS,
  DOCUMENT_STATUS,
} from './documents.constants';
import type { InvoiceDocumentGenerationErrorCode } from './invoice-document-generation.types';

/** Placeholder until storage succeeds — never exposed for download. */
export const PENDING_OBJECT_KEY = '__generation_pending__';

const RETRY_DELAYS_MS = [60_000, 300_000, 900_000];

export function generationLockKey(
  organizationId: string,
  invoiceId: string,
  documentType: string,
): string {
  return `invoice-doc-gen:${organizationId}:${invoiceId}:${documentType}`;
}

export function classifyGenerationError(err: unknown): {
  code: InvoiceDocumentGenerationErrorCode;
  message: string;
  retryable: boolean;
} {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError ||
    (typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      typeof (err as { code: unknown }).code === 'string' &&
      (err as { code: string }).code.startsWith('P'))
  ) {
    return {
      code: 'DATABASE_ERROR',
      message: 'Database error during invoice document generation',
      retryable: true,
    };
  }
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes('render') || lower.includes('pdfkit') || lower.includes('pdf')) {
    return { code: 'RENDERER_ERROR', message: sanitizeErrorMessage(msg), retryable: true };
  }
  if (
    lower.includes('storage') ||
    lower.includes('enoent') ||
    lower.includes('eacces') ||
    lower.includes('putobject')
  ) {
    return { code: 'STORAGE_ERROR', message: sanitizeErrorMessage(msg), retryable: true };
  }
  return { code: 'UNKNOWN_ERROR', message: sanitizeErrorMessage(msg), retryable: false };
}

export function sanitizeErrorMessage(message: string): string {
  const trimmed = message.trim().slice(0, 500);
  return trimmed || 'Invoice document generation failed';
}

export function computeNextRetryAt(attemptCount: number): Date | null {
  if (attemptCount <= 0) return null;
  const idx = Math.min(attemptCount - 1, RETRY_DELAYS_MS.length - 1);
  return new Date(Date.now() + RETRY_DELAYS_MS[idx]!);
}

export function isRetryableErrorCode(code: InvoiceDocumentGenerationErrorCode): boolean {
  return code === 'RENDERER_ERROR' || code === 'STORAGE_ERROR' || code === 'DATABASE_ERROR';
}

export function isInFlightGeneration(doc: {
  generationStatus: string | null;
  status: string;
  objectKey: string;
}): boolean {
  if (doc.generationStatus === DOCUMENT_GENERATION_STATUS.PROCESSING) return true;
  if (doc.generationStatus === DOCUMENT_GENERATION_STATUS.PENDING) return true;
  return doc.status === DOCUMENT_STATUS.DRAFT && doc.objectKey === PENDING_OBJECT_KEY;
}
