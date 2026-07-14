import type { GeneratedDocument } from '@prisma/client';
import type { InvoiceDocumentType } from '@modules/invoices/invoice-document-integrity-audit.util';

export type InvoiceDocumentGenerationErrorCode =
  | 'INVOICE_NOT_FOUND'
  | 'INTEGRITY_ERROR'
  | 'CONCURRENT_GENERATION'
  | 'RENDERER_ERROR'
  | 'STORAGE_ERROR'
  | 'DATABASE_ERROR'
  | 'UNKNOWN_ERROR';

export interface GenerateInvoiceDocumentInput {
  organizationId: string;
  invoiceId: string;
  documentType: InvoiceDocumentType;
  title: string;
  fileName: string;
  renderPdf: () => Promise<Buffer>;
  bookingId?: string | null;
  customerId?: string | null;
  vehicleId?: string | null;
  documentNumber?: string | null;
  templateKey?: string | null;
  templateVersion?: string | null;
  generatedByUserId?: string | null;
  snapshot?: Record<string, unknown> | null;
  /** When false and an active stored version exists, returns it (idempotent). */
  force?: boolean;
  /** Optional idempotency token for job retries — reuses in-flight PROCESSING row. */
  idempotencyKey?: string | null;
}

export interface InvoiceDocumentGenerationResult {
  document: GeneratedDocument;
  created: boolean;
  versionNumber: number;
}

export class InvoiceDocumentGenerationError extends Error {
  constructor(
    message: string,
    readonly code: InvoiceDocumentGenerationErrorCode,
    readonly retryable: boolean,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'InvoiceDocumentGenerationError';
  }
}
