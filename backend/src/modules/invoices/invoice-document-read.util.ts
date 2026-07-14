import { DOCUMENT_GENERATION_STATUS, DOCUMENT_STATUS } from '@modules/documents/documents.constants';
import { hasStorageKey, isActiveDocumentStatus } from './invoice-document-integrity-audit.util';

export type InvoiceDocumentLifecycle =
  | 'ACTIVE'
  | 'REPLACED'
  | 'FAILED'
  | 'VOIDED'
  | 'GENERATING';

export interface InvoiceDocumentReadRow {
  id: string;
  organizationId: string;
  documentType: string;
  status: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  objectKey: string;
  invoiceId: string | null;
  versionNumber: number | null;
  isActiveVersion: boolean;
  generationStatus: string | null;
  generationErrorCode: string | null;
  lastErrorMessage: string | null;
  nextRetryAt: Date | null;
  generatedByUserId: string | null;
  createdAt: Date;
}

export function sortInvoiceDocuments<T extends { versionNumber: number | null; createdAt: Date }>(
  docs: T[],
): T[] {
  return [...docs].sort((a, b) => {
    if (a.versionNumber != null && b.versionNumber != null && a.versionNumber !== b.versionNumber) {
      return a.versionNumber - b.versionNumber;
    }
    if (a.versionNumber != null && b.versionNumber == null) return -1;
    if (a.versionNumber == null && b.versionNumber != null) return 1;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

export function isGeneratingDocument(doc: InvoiceDocumentReadRow): boolean {
  if (doc.generationStatus === DOCUMENT_GENERATION_STATUS.PENDING) return true;
  if (doc.generationStatus === DOCUMENT_GENERATION_STATUS.PROCESSING) return true;
  return doc.status === DOCUMENT_STATUS.DRAFT && !hasStorageKey(doc.objectKey);
}

export function mapDocumentLifecycle(
  doc: InvoiceDocumentReadRow,
  isActive: boolean,
): InvoiceDocumentLifecycle {
  if (isActive && isActiveDocumentStatus(doc.status)) return 'ACTIVE';
  if (doc.status === DOCUMENT_STATUS.VOID) return 'VOIDED';
  if (doc.status === DOCUMENT_STATUS.FAILED || doc.generationStatus === DOCUMENT_GENERATION_STATUS.FAILED) {
    return 'FAILED';
  }
  if (isGeneratingDocument(doc)) return 'GENERATING';
  if (!isActive && isActiveDocumentStatus(doc.status)) return 'REPLACED';
  return 'REPLACED';
}

export function isRetryableDocument(doc: InvoiceDocumentReadRow): boolean {
  if (doc.generationStatus === DOCUMENT_GENERATION_STATUS.RETRY_SCHEDULED) return true;
  if (doc.generationStatus === DOCUMENT_GENERATION_STATUS.FAILED && doc.nextRetryAt != null) return true;
  return doc.status === DOCUMENT_STATUS.FAILED && doc.nextRetryAt != null;
}

/** ADR hybrid C (query) + A (validated cache fallback). */
export function resolveCanonicalActiveDocumentId(
  docs: InvoiceDocumentReadRow[],
  expectedDocumentType: string,
  cacheDocumentId: string | null,
  invoiceId: string,
): { activeDocumentId: string | null; cacheMismatch: boolean } {
  const typed = docs.filter(
    (d) => d.documentType === expectedDocumentType && d.invoiceId === invoiceId,
  );
  const activeCandidates = typed.filter((d) => isActiveDocumentStatus(d.status));

  let activeId: string | null = null;

  const flagged = activeCandidates.filter((d) => d.isActiveVersion);
  if (flagged.length === 1) {
    activeId = flagged[0].id;
  } else if (activeCandidates.length > 0) {
    const sorted = [...activeCandidates].sort((a, b) => {
      if (a.versionNumber != null && b.versionNumber != null && b.versionNumber !== a.versionNumber) {
        return b.versionNumber - a.versionNumber;
      }
      if (a.versionNumber != null && b.versionNumber == null) return -1;
      if (a.versionNumber == null && b.versionNumber != null) return 1;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    activeId = sorted[0]?.id ?? null;
  }

  if (!activeId && cacheDocumentId) {
    const cached = docs.find((d) => d.id === cacheDocumentId);
    if (
      cached &&
      cached.documentType === expectedDocumentType &&
      isActiveDocumentStatus(cached.status) &&
      hasStorageKey(cached.objectKey) &&
      (cached.invoiceId == null || cached.invoiceId === invoiceId)
    ) {
      activeId = cached.id;
    }
  }

  const cacheMismatch =
    !!cacheDocumentId &&
    !!activeId &&
    cacheDocumentId !== activeId &&
    isActiveDocumentStatus(docs.find((d) => d.id === cacheDocumentId)?.status ?? '');

  return { activeDocumentId: activeId, cacheMismatch };
}

export function filterIntegrityValidDocuments(
  docs: InvoiceDocumentReadRow[],
  organizationId: string,
  invoiceId: string,
): InvoiceDocumentReadRow[] {
  return docs.filter(
    (d) =>
      d.organizationId === organizationId &&
      (d.invoiceId == null || d.invoiceId === invoiceId),
  );
}

export function buildAuthorizedDownloadPath(organizationId: string, documentId: string): string {
  return `/organizations/${organizationId}/documents/${documentId}/download`;
}
