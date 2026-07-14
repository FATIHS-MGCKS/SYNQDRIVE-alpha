import type { InvoiceDetail, InvoiceLineItem, InvoicePayment } from './invoiceTypes';

/** Nested payload from GET .../invoices/:id/detail (backend InvoiceDetailDto). */
export interface InvoiceDetailApiDto {
  invoice: {
    id: string;
    invoiceNumber: string;
    legacyInvoiceNumber: number | null;
    type: string;
    status: string;
    title: string;
    description: string;
    currency: string;
    invoiceDate: string;
    issueDate: string | null;
    dueDate: string | null;
    sentAt: string | null;
    paidAt: string | null;
    createdAt: string;
    generatedDocumentId: string | null;
    activeDocumentId: string | null;
    documentCacheMismatch: boolean;
    documentExtractionId: string | null;
    imageUrl: string | null;
  };
  amounts: {
    subtotalNetCents: number;
    taxTotalCents: number;
    totalGrossCents: number;
    paidAmountCents: number;
    outstandingAmountCents: number;
  };
  customer: InvoiceDetail['customer'];
  supplier: { id: string; displayName: string; email: string | null; phone: string | null } | null;
  booking: InvoiceDetail['booking'];
  vehicle: InvoiceDetail['vehicle'];
  relations: InvoiceDetail['relations'];
  lineItems: InvoiceLineItem[];
  payments: InvoicePayment[];
  documents: unknown[];
  linkedTasks: { id: string; title: string; status: string }[];
  notes: string;
  provenance: InvoiceDetail['provenance'];
  timeline: InvoiceDetail['timeline'];
  capabilities: InvoiceDetail['capabilities'];
  outboundEmails?: unknown[];
}

/**
 * Flattens nested detail DTO into InvoiceDetail for existing InvoicesView bindings.
 * Relation summaries (customer/booking/vehicle) stay on the enriched fields.
 */
export function normalizeInvoiceDetailFromApi(dto: InvoiceDetailApiDto): InvoiceDetail {
  const inv = dto.invoice;
  const customerId = dto.relations?.invoiceCustomerId ?? dto.customer?.id ?? null;
  const bookingId = dto.booking?.id ?? null;
  const vehicleId = dto.vehicle?.id ?? null;

  return {
    id: inv.id,
    invoiceNumber: inv.legacyInvoiceNumber,
    legacyInvoiceNumber: inv.legacyInvoiceNumber,
    invoiceNumberDisplay: inv.invoiceNumber,
    type: inv.type,
    status: inv.status,
    title: inv.title,
    description: inv.description,
    customerId,
    vendorId: dto.supplier?.id ?? null,
    vendorName: dto.supplier?.displayName ?? null,
    bookingId,
    vehicleId,
    lineItems: dto.lineItems.length ? dto.lineItems : null,
    subtotalCents: dto.amounts.subtotalNetCents,
    taxCents: dto.amounts.taxTotalCents,
    totalCents: dto.amounts.totalGrossCents,
    paidCents: dto.amounts.paidAmountCents,
    outstandingCents: dto.amounts.outstandingAmountCents,
    currency: inv.currency,
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate,
    issuedAt: inv.issueDate ?? undefined,
    sentAt: inv.sentAt ?? undefined,
    paidAt: inv.paidAt,
    createdAt: inv.createdAt,
    templateId: null,
    imageUrl: inv.imageUrl,
    extractedData: null,
    documentExtractionId: inv.documentExtractionId,
    generatedDocumentId: inv.activeDocumentId ?? inv.generatedDocumentId,
    activeDocumentId: inv.activeDocumentId,
    documentCacheMismatch: inv.documentCacheMismatch,
    notes: dto.notes,
    tasks: dto.linkedTasks,
    payments: dto.payments,
    customer: dto.customer,
    booking: dto.booking,
    vehicle: dto.vehicle,
    relations: dto.relations,
    documents: dto.documents,
    provenance: dto.provenance,
    timeline: dto.timeline,
    capabilities: dto.capabilities,
    outboundEmails: dto.outboundEmails,
  };
}
