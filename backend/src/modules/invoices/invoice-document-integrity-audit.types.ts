export type InvoiceDocumentAuditSeverity = 'critical' | 'error' | 'warning' | 'info';

export type InvoiceDocumentRepairClass =
  | 'AUTO_FIX_SAFE'
  | 'AUTO_FIX_WITH_RULE'
  | 'MANUAL_REVIEW'
  | 'UNRECOVERABLE';

export type InvoiceDocumentIntegrityCheckId =
  | 'cache_document_missing'
  | 'cache_document_invoice_mismatch'
  | 'invoice_missing_active_pointer'
  | 'multiple_active_documents'
  | 'duplicate_version_numbers'
  | 'invoice_doc_without_invoice_link'
  | 'orphan_invoice_id_on_document'
  | 'organization_mismatch'
  | 'bundle_doc_not_linked_to_invoice'
  | 'booking_invoice_without_document'
  | 'document_completed_without_storage'
  | 'document_file_with_bad_status'
  | 'multiple_active_candidates'
  | 'ambiguous_legacy_assignment';

export interface InvoiceDocumentAuditFilters {
  organizationId?: string;
  invoiceId?: string;
  limit?: number;
  batchSize?: number;
}

export interface InvoiceDocumentIntegrityFinding {
  checkId: InvoiceDocumentIntegrityCheckId;
  severity: InvoiceDocumentAuditSeverity;
  repairClass: InvoiceDocumentRepairClass;
  organizationId: string;
  message: string;
  entityType: 'OrgInvoice' | 'GeneratedDocument' | 'BookingDocumentBundle' | 'Booking';
  entityId: string;
  relatedIds?: Record<string, string | null>;
  details?: Record<string, string | number | boolean | null>;
}

export interface InvoiceDocumentIntegrityOrgReport {
  organizationId: string;
  countsByCheck: Partial<Record<InvoiceDocumentIntegrityCheckId, number>>;
  countsByRepairClass: Partial<Record<InvoiceDocumentRepairClass, number>>;
  findings: InvoiceDocumentIntegrityFinding[];
  truncated: boolean;
}

export interface InvoiceDocumentIntegrityAuditReport {
  mode: 'audit';
  readOnly: true;
  generatedAt: string;
  filters: InvoiceDocumentAuditFilters;
  organizationsScanned: number;
  entitiesScanned: {
    invoices: number;
    documents: number;
    bundles: number;
  };
  summary: {
    totalFindings: number;
    critical: number;
    errors: number;
    warnings: number;
    infos: number;
    byCheckId: Partial<Record<InvoiceDocumentIntegrityCheckId, number>>;
    byRepairClass: Partial<Record<InvoiceDocumentRepairClass, number>>;
  };
  organizations: InvoiceDocumentIntegrityOrgReport[];
}
