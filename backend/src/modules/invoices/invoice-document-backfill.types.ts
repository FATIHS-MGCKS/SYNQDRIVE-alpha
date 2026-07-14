export type InvoiceDocumentBackfillMode = 'dry-run' | 'apply';

export interface InvoiceDocumentBackfillCheckpoint {
  organizationId: string;
  lastInvoiceId: string | null;
  processedInvoices: number;
  updatedAt: string;
}

export interface InvoiceDocumentBackfillOptions {
  organizationId: string;
  invoiceId?: string;
  mode: InvoiceDocumentBackfillMode;
  batchSize?: number;
  transactionSize?: number;
  checkpoint?: InvoiceDocumentBackfillCheckpoint | null;
  confirmed?: boolean;
}

export type InvoiceDocumentBackfillActionKind =
  | 'sync_cache_from_document'
  | 'sync_invoice_id_from_cache'
  | 'sync_from_bundle_pointer'
  | 'set_active_version'
  | 'assign_version_numbers'
  | 'clear_stale_active_flags';

export interface InvoiceDocumentBackfillAction {
  actionId: string;
  kind: InvoiceDocumentBackfillActionKind;
  organizationId: string;
  invoiceId: string | null;
  documentId: string;
  reason: string;
  before: Record<string, string | number | boolean | null>;
  after: Record<string, string | number | boolean | null>;
}

export interface InvoiceDocumentBackfillSkip {
  reason: string;
  entityType: 'OrgInvoice' | 'GeneratedDocument' | 'BookingDocumentBundle';
  entityId: string;
  checkId?: string;
}

export interface InvoiceDocumentBackfillStats {
  checked: number;
  changed: number;
  skipped: number;
  manualReview: number;
  errors: number;
  alreadyCorrect: number;
}

export interface InvoiceDocumentBackfillLogEntry {
  at: string;
  level: 'info' | 'action' | 'skip' | 'error';
  message: string;
  actionId?: string;
  entityId?: string;
}

export interface InvoiceDocumentBackfillResult {
  mode: InvoiceDocumentBackfillMode;
  readOnly: boolean;
  organizationId: string;
  generatedAt: string;
  durationMs: number;
  confirmed: boolean;
  stats: InvoiceDocumentBackfillStats;
  actions: InvoiceDocumentBackfillAction[];
  skipped: InvoiceDocumentBackfillSkip[];
  auditLog: InvoiceDocumentBackfillLogEntry[];
  checkpoint: InvoiceDocumentBackfillCheckpoint;
  auditBefore?: unknown;
}

export interface InvoiceDocumentBackfillDataRow {
  invoices: Array<{
    id: string;
    organizationId: string;
    type: string;
    status: string;
    bookingId: string | null;
    generatedDocumentId: string | null;
  }>;
  documents: Array<{
    id: string;
    organizationId: string;
    documentType: string;
    status: string;
    bookingId: string | null;
    invoiceId: string | null;
    versionNumber: number | null;
    isActiveVersion: boolean;
    objectKey: string;
    createdAt: Date;
  }>;
  bundles: Array<{
    id: string;
    organizationId: string;
    bookingId: string;
    bookingInvoiceDocumentId: string | null;
    finalInvoiceDocumentId: string | null;
  }>;
}
