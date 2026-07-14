import type { OrgInvoiceStatus, OrgInvoiceType } from './invoiceTypes';

export type InvoiceActionGate = {
  allowed: boolean;
  reason?: string;
};

export type InvoiceHeaderActionKey =
  | 'view_pdf'
  | 'generate_pdf'
  | 'send_email'
  | 'regenerate_pdf'
  | 'mark_sent_externally'
  | 'record_payment'
  | 'edit'
  | 'cancel'
  | 'copy_internal_id'
  | 'issue';

export type InvoiceActionMatrix = Record<InvoiceHeaderActionKey, InvoiceActionGate>;

/** Structured detail view model for invoice detail surfaces (header-first). */
export type InvoiceDetailDto = {
  core: {
    invoiceId: string;
    invoiceNumberDisplay: string;
    title: string;
    type: OrgInvoiceType | string;
    typeLabel: string;
    status: OrgInvoiceStatus | string;
    statusLabel: string;
    currency: string;
    invoiceDate: string;
    dueDate: string | null;
  };
  amounts: {
    totalCents: number;
    paidCents: number;
    outstandingCents: number;
    totalFormatted: string;
    paidFormatted: string;
    outstandingFormatted: string;
    invoiceDateFormatted: string;
    dueDateFormatted: string;
  };
  document: {
    hasPdf: boolean;
    generatedDocumentId: string | null;
    bookingId: string | null;
    regenerateDocumentType: string | null;
    attachmentUrl: string | null;
  };
  permissions: {
    canManageEmail: boolean;
    canManageFinance: boolean;
    canEditMetadata: boolean;
  };
  actions: InvoiceActionMatrix;
  primary: {
    viewPdf: InvoiceActionGate;
    generatePdf: InvoiceActionGate;
    sendEmail: InvoiceActionGate;
  };
  relations: InvoiceRelationsDto;
};

export type InvoiceRelationFallback =
  | 'archived'
  | 'deleted'
  | 'unavailable'
  | 'legacy';

export type InvoiceRelationKind = 'customer' | 'booking' | 'vehicle' | 'vendor';

export type InvoiceEntityRelation = {
  kind: InvoiceRelationKind;
  label: string;
  primary: string;
  secondary: string | null;
  tertiary: string | null;
  fallback: InvoiceRelationFallback | null;
  entityId: string | null;
  navigable: boolean;
  navigationBlockedReason: string | null;
};

export type InvoiceProvenanceDto = {
  erstelltVon: string;
  erstelltUeber: string;
  quelle: string;
  isLegacy: boolean;
};

export type InvoiceRelationsDto = {
  customer: InvoiceEntityRelation | null;
  booking: InvoiceEntityRelation | null;
  vehicle: InvoiceEntityRelation | null;
  vendor: InvoiceEntityRelation | null;
  provenance: InvoiceProvenanceDto;
  template: { id: string; name: string } | null;
};
