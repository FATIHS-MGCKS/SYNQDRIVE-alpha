import type { DocumentUploadDuplicateStatus } from '../rental/lib/document-extraction.types';

export const DOCUMENT_UPLOAD_DUPLICATE_ERROR_CODE = 'DOCUMENT_UPLOAD_DUPLICATE_BLOCKED';

export interface UploadDuplicateEntityLinks {
  fineIds: string[];
  invoiceIds: string[];
  damageIds: string[];
  serviceEventIds: string[];
}

export interface UploadDuplicateExistingExtraction {
  id: string;
  vehicleId: string;
  organizationId: string | null;
  status: string;
  processingStage: string;
  sourceFileName: string | null;
  effectiveDocumentType: string | null;
  requestedDocumentType: string | null;
  contentSha256: string | null;
  createdAt: string;
  appliedAt: string | null;
  entityLinks: UploadDuplicateEntityLinks;
}

export interface UploadDuplicateBlockedPayload {
  statusCode: number;
  errorCode: string;
  duplicateStatus: DocumentUploadDuplicateStatus;
  detectedAs?: string;
  message: string;
  existingExtraction: UploadDuplicateExistingExtraction | null;
  relatedExtractionId: string | null;
}

export class DocumentUploadDuplicateError extends Error {
  readonly payload: UploadDuplicateBlockedPayload;

  constructor(payload: UploadDuplicateBlockedPayload) {
    super(payload.message);
    this.name = 'DocumentUploadDuplicateError';
    this.payload = payload;
  }
}

export function parseUploadDuplicateError(body: unknown): DocumentUploadDuplicateError | null {
  if (!body || typeof body !== 'object') return null;
  const row = body as Record<string, unknown>;
  const nested = row.message && typeof row.message === 'object' ? (row.message as Record<string, unknown>) : row;
  const errorCode = String(nested.errorCode ?? row.errorCode ?? '');
  if (errorCode !== DOCUMENT_UPLOAD_DUPLICATE_ERROR_CODE) return null;

  return new DocumentUploadDuplicateError({
    statusCode: Number(nested.statusCode ?? row.statusCode ?? 409),
    errorCode,
    duplicateStatus: String(nested.duplicateStatus ?? 'DUPLICATE_BLOCKED') as DocumentUploadDuplicateStatus,
    detectedAs: nested.detectedAs ? String(nested.detectedAs) : undefined,
    message: String(
      typeof nested.message === 'string'
        ? nested.message
        : 'Ein identisches Dokument existiert bereits in dieser Organisation.',
    ),
    existingExtraction: (nested.existingExtraction as UploadDuplicateExistingExtraction | null) ?? null,
    relatedExtractionId:
      typeof nested.relatedExtractionId === 'string' ? nested.relatedExtractionId : null,
  });
}

export function formatUploadDuplicateLinks(links: UploadDuplicateEntityLinks): string[] {
  const rows: string[] = [];
  if (links.invoiceIds.length) rows.push(`Rechnungen: ${links.invoiceIds.length}`);
  if (links.fineIds.length) rows.push(`Bußgelder: ${links.fineIds.length}`);
  if (links.damageIds.length) rows.push(`Schäden: ${links.damageIds.length}`);
  if (links.serviceEventIds.length) rows.push(`Service-Ereignisse: ${links.serviceEventIds.length}`);
  return rows;
}
