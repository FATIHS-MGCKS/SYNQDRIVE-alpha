import type { InvoiceDocumentLifecycle } from './invoice-document-read.util';

export interface InvoiceDocumentSummaryDto {
  id: string;
  documentType: string;
  filename: string;
  version: number | null;
  status: string;
  generationStatus: string | null;
  lifecycle: InvoiceDocumentLifecycle;
  isActive: boolean;
  createdAt: string;
  createdBy: string | null;
  mimeType: string;
  sizeBytes: number | null;
  downloadAvailable: boolean;
  previewAvailable: boolean;
  /** Authorized API path — never a raw storage URL. */
  downloadPath: string | null;
  lastError: string | null;
  retryable: boolean;
}

export interface InvoiceDocumentsViewDto {
  activeDocumentId: string | null;
  cacheMismatch: boolean;
  documents: InvoiceDocumentSummaryDto[];
}

export interface InvoiceDocumentsReadOptions {
  organizationId: string;
  invoiceId: string;
  invoiceType: string;
  cacheDocumentId?: string | null;
  includeInternalErrors?: boolean;
}
