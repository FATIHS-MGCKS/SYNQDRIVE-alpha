import {
  Customer,
  OrgInvoice,
  OrgInvoicePayment,
  OrgInvoiceType,
  OrgTask,
  OutboundEmail,
  OutboundEmailAttachment,
  Vehicle,
} from '@prisma/client';
import { bookingRef } from '@modules/documents/templates/template-helpers';
import { displayInvoiceNumber, isOutgoingInvoiceType } from './invoice-domain.util';
import { parseLegacyLineItems, computeInvoiceTotals } from './invoice-line-items.util';
import { buildInvoiceDetailCapabilities } from './invoice-detail-actions.util';
import type { InvoiceDocumentsViewDto } from './invoice-document-read.types';
import type {
  InvoiceBookingSummaryDto,
  InvoiceCustomerSummaryDto,
  InvoiceDetailDto,
  InvoiceDetailLineItemDto,
  InvoiceDetailPaymentDto,
  InvoiceDirection,
  InvoiceOutboundEmailSummaryDto,
  InvoiceProvenanceDto,
  InvoiceSupplierSummaryDto,
  InvoiceTimelineEventDto,
  InvoiceVehicleSummaryDto,
  InvoiceLinkedTaskDto,
} from './invoice-detail.types';

type BookingRow = {
  id: string;
  status: string;
  startDate: Date;
  endDate: Date;
};

type VendorRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

type ActivityRow = {
  id: string;
  action: string;
  description: string;
  createdAt: Date;
};

export interface InvoiceDetailMapperInput {
  invoice: OrgInvoice & {
    tasks: OrgTask[];
    payments: OrgInvoicePayment[];
    vendor: VendorRow | null;
  };
  customer: Customer | null;
  vehicle: Vehicle | null;
  booking: BookingRow | null;
  documentsView: InvoiceDocumentsViewDto;
  outboundEmails: Array<OutboundEmail & { attachments: OutboundEmailAttachment[] }>;
  timeline: ActivityRow[];
}

function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

function customerDisplayName(c: Customer): string {
  const person = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  if (person) return person;
  if (c.company) return c.company;
  return `Kunde ${c.id.slice(0, 8)}`;
}

function vehicleDisplayName(v: Vehicle): string {
  if (v.vehicleName?.trim()) return v.vehicleName.trim();
  const base = [v.make, v.model].filter(Boolean).join(' ');
  const year = v.year ? ` (${v.year})` : '';
  return `${base}${year}`.trim() || `Fahrzeug ${v.id.slice(0, 8)}`;
}

function mapDirection(type: OrgInvoiceType): InvoiceDirection {
  return isOutgoingInvoiceType(type) ? 'OUTGOING' : 'INCOMING';
}

function mapLineItems(raw: unknown, fallbackTotalCents: number): InvoiceDetailLineItemDto[] {
  const parsed = parseLegacyLineItems(raw);
  if (!parsed.length) {
    if (fallbackTotalCents <= 0) return [];
    const totals = computeInvoiceTotals([], fallbackTotalCents);
    return [
      {
        description: 'Gesamtbetrag',
        quantity: 1,
        unitPriceNetCents: totals.subtotalCents,
        taxRate: 19,
        netCents: totals.subtotalCents,
        taxCents: totals.taxCents,
        grossCents: totals.totalCents,
      },
    ];
  }
  const computed = computeInvoiceTotals(parsed, fallbackTotalCents);
  return computed.lineItems.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitPriceNetCents: item.unitPriceNetCents,
    taxRate: item.taxRate,
    netCents: item.netCents,
    taxCents: item.taxCents,
    grossCents: item.grossCents,
  }));
}

function mapProvenance(inv: OrgInvoice): InvoiceProvenanceDto {
  if (inv.type === 'OUTGOING_BOOKING') {
    return {
      kind: 'BOOKING_AUTOMATIC',
      label: 'Automatisch (Buchung)',
      documentExtractionId: inv.documentExtractionId,
      bookingId: inv.bookingId,
    };
  }
  if (inv.type === 'OUTGOING_FINAL') {
    return {
      kind: 'BOOKING_FINAL',
      label: 'Automatisch (Schlussrechnung)',
      documentExtractionId: inv.documentExtractionId,
      bookingId: inv.bookingId,
    };
  }
  if (inv.type === 'INCOMING_UPLOADED' || inv.documentExtractionId) {
    return {
      kind: 'DOCUMENT_EXTRACTION',
      label: 'Document Extraction',
      documentExtractionId: inv.documentExtractionId,
      bookingId: inv.bookingId,
    };
  }
  if (inv.type === 'INCOMING_VENDOR') {
    return {
      kind: 'VENDOR',
      label: 'Lieferant / Eingangsrechnung',
      documentExtractionId: inv.documentExtractionId,
      bookingId: inv.bookingId,
    };
  }
  return {
    kind: 'MANUAL',
    label: 'Manuell',
    documentExtractionId: inv.documentExtractionId,
    bookingId: inv.bookingId,
  };
}

function mapCustomer(c: Customer | null): InvoiceCustomerSummaryDto | null {
  if (!c) return null;
  return {
    id: c.id,
    displayName: customerDisplayName(c),
    email: c.email,
    phone: c.phone,
    company: c.company,
    status: c.status,
  };
}

function mapSupplier(inv: InvoiceDetailMapperInput['invoice']): InvoiceSupplierSummaryDto | null {
  if (inv.vendor) {
    return {
      id: inv.vendor.id,
      displayName: inv.vendor.name,
      email: inv.vendor.email,
      phone: inv.vendor.phone,
    };
  }
  if (inv.vendorName) {
    return {
      id: inv.vendorId ?? '',
      displayName: inv.vendorName,
      email: null,
      phone: null,
    };
  }
  return null;
}

function mapBooking(b: BookingRow | null): InvoiceBookingSummaryDto | null {
  if (!b) return null;
  return {
    id: b.id,
    reference: bookingRef(b.id),
    status: b.status,
    startDate: b.startDate.toISOString(),
    endDate: b.endDate.toISOString(),
  };
}

function mapVehicle(v: Vehicle | null): InvoiceVehicleSummaryDto | null {
  if (!v) return null;
  return {
    id: v.id,
    displayName: vehicleDisplayName(v),
    licensePlate: v.licensePlate,
    vin: v.vin,
    make: v.make,
    model: v.model,
    year: v.year,
  };
}

function mapPayments(payments: OrgInvoicePayment[]): InvoiceDetailPaymentDto[] {
  return payments.map((p) => ({
    id: p.id,
    amountCents: p.amountCents,
    method: p.method,
    paidAt: p.paidAt.toISOString(),
    reference: p.reference,
    note: p.note,
  }));
}

function mapTasks(tasks: OrgTask[]): InvoiceLinkedTaskDto[] {
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    description: t.description,
    dueAt: iso(t.dueDate),
  }));
}

function mapOutboundEmails(
  rows: Array<OutboundEmail & { attachments: OutboundEmailAttachment[] }>,
): InvoiceOutboundEmailSummaryDto[] {
  return rows.map((e) => ({
    id: e.id,
    status: e.status,
    toEmail: e.toEmail,
    subject: e.subject,
    sentAt: iso(e.sentAt),
    createdAt: e.createdAt.toISOString(),
    attachmentDocumentIds: e.attachments
      .map((a) => a.generatedDocumentId)
      .filter((id): id is string => !!id),
  }));
}

function mapTimeline(rows: ActivityRow[]): InvoiceTimelineEventDto[] {
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    description: r.description,
    createdAt: r.createdAt.toISOString(),
  }));
}

export function mapInvoiceDetail(input: InvoiceDetailMapperInput): InvoiceDetailDto {
  const { invoice: inv, documentsView } = input;
  const paidCents = inv.paidCents ?? 0;
  const totalCents = inv.totalCents ?? 0;
  const outstandingCents =
    inv.outstandingCents ?? Math.max(0, totalCents - paidCents);
  const activeDocumentId = documentsView.activeDocumentId;

  const capabilities = buildInvoiceDetailCapabilities({
    type: inv.type,
    status: inv.status,
    totalCents,
    paidCents,
    outstandingCents,
    sequenceNumber: inv.sequenceNumber,
    bookingId: inv.bookingId,
    customerEmail: input.customer?.email ?? null,
    documentsView,
  });

  return {
    invoice: {
      id: inv.id,
      invoiceNumber: displayInvoiceNumber(inv),
      legacyInvoiceNumber: inv.legacyInvoiceNumber ?? inv.invoiceNumber,
      sequenceYear: inv.sequenceYear,
      sequenceNumber: inv.sequenceNumber,
      direction: mapDirection(inv.type),
      type: inv.type,
      status: inv.status,
      title: inv.title,
      description: inv.description ?? '',
      currency: inv.currency,
      invoiceDate: inv.invoiceDate.toISOString(),
      issueDate: iso(inv.issuedAt),
      dueDate: iso(inv.dueDate),
      sentAt: iso(inv.sentAt),
      paidAt: iso(inv.paidAt),
      cancelledAt: iso(inv.cancelledAt),
      voidedAt: iso(inv.voidedAt),
      creditedAt: iso(inv.creditedAt),
      createdAt: inv.createdAt.toISOString(),
      updatedAt: inv.updatedAt.toISOString(),
      generatedDocumentId: activeDocumentId ?? inv.generatedDocumentId,
      activeDocumentId,
      documentCacheMismatch: documentsView.cacheMismatch,
      documentExtractionId: inv.documentExtractionId,
      imageUrl: inv.imageUrl,
    },
    amounts: {
      subtotalNetCents: inv.subtotalCents,
      taxTotalCents: inv.taxCents,
      totalGrossCents: totalCents,
      paidAmountCents: paidCents,
      outstandingAmountCents: outstandingCents,
      creditAmountCents: inv.status === 'CREDITED' ? totalCents : null,
    },
    customer: mapCustomer(input.customer),
    supplier: mapSupplier(inv),
    booking: mapBooking(input.booking),
    vehicle: mapVehicle(input.vehicle),
    lineItems: mapLineItems(inv.lineItems, totalCents),
    payments: mapPayments(inv.payments),
    documents: documentsView.documents,
    outboundEmails: mapOutboundEmails(input.outboundEmails),
    linkedTasks: mapTasks(inv.tasks),
    notes: inv.notes ?? '',
    provenance: mapProvenance(inv),
    timeline: mapTimeline(input.timeline),
    capabilities,
  };
}
