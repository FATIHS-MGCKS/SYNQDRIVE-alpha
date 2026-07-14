import { OrgInvoiceType } from '@prisma/client';
import { displayInvoiceNumber, isOutgoingInvoiceType } from './invoice-domain.util';
import { parseLegacyLineItems, computeInvoiceTotals } from './invoice-line-items.util';
import type { OrgTaxSettings } from './invoice-tax.util';
import { resolveOrgDefaultTaxRate } from './invoice-tax.util';
import { buildInvoiceDetailCapabilities } from './invoice-detail-actions.util';
import type { InvoiceDocumentsViewDto } from './invoice-document-read.types';
import {
  buildCustomerDivergence,
  mapInvoiceBookingSummary,
  mapInvoiceCustomerSummary,
  mapInvoiceVehicleSummary,
  parseInvoiceRelationSnapshots,
  type BookingRow,
  type CustomerRow,
  type VehicleRow,
} from './invoice-detail-relations.util';
import { mapInvoiceProvenance, type InvoiceProvenanceActorRow } from './invoice-provenance.util';
import type {
  InvoiceDetailDto,
  InvoiceDetailLineItemDto,
  InvoiceDetailPaymentDto,
  InvoiceDirection,
  InvoiceLinkedTaskDto,
  InvoiceOutboundEmailSummaryDto,
  InvoiceSupplierSummaryDto,
  InvoiceTimelineEventDto,
} from './invoice-detail.types';
import type {
  Customer,
  OrgInvoice,
  OrgInvoicePayment,
  OrgTask,
  OutboundEmail,
  OutboundEmailAttachment,
  Vehicle,
} from '@prisma/client';

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
  includeVin?: boolean;
  createdByActor?: InvoiceProvenanceActorRow | null;
  orgTax?: OrgTaxSettings;
}

function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

function mapDirection(type: OrgInvoiceType): InvoiceDirection {
  return isOutgoingInvoiceType(type) ? 'OUTGOING' : 'INCOMING';
}

function mapLineItems(
  raw: unknown,
  fallbackTotalCents: number,
  orgTax?: OrgTaxSettings,
): InvoiceDetailLineItemDto[] {
  const taxOptions = orgTax ? { orgTax } : undefined;
  const parsed = parseLegacyLineItems(raw, taxOptions);
  if (!parsed.length) {
    if (fallbackTotalCents <= 0) return [];
    const totals = computeInvoiceTotals([], fallbackTotalCents, taxOptions);
    const defaultRate =
      totals.taxMeta?.assumedTaxRatePercent ?? resolveOrgDefaultTaxRate(orgTax ?? {});
    return [
      {
        description: 'Gesamtbetrag',
        quantity: 1,
        unitPriceNetCents: totals.subtotalCents,
        taxRate: defaultRate,
        netCents: totals.subtotalCents,
        taxCents: totals.taxCents,
        grossCents: totals.totalCents,
      },
    ];
  }
  const computed = computeInvoiceTotals(parsed, fallbackTotalCents, taxOptions);
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
  const snapshots = parseInvoiceRelationSnapshots(inv.extractedData);

  const customer = mapInvoiceCustomerSummary({
    customerId: inv.customerId,
    customer: input.customer as CustomerRow | null,
    snapshots,
  });
  const booking = mapInvoiceBookingSummary({
    bookingId: inv.bookingId,
    booking: input.booking,
  });
  const vehicle = mapInvoiceVehicleSummary({
    vehicleId: inv.vehicleId,
    vehicle: input.vehicle as VehicleRow | null,
    snapshots,
    includeVin: input.includeVin ?? false,
  });
  const relations = buildCustomerDivergence({
    invoiceCustomerId: inv.customerId,
    booking: input.booking,
  });

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
    customer,
    supplier: mapSupplier(inv),
    booking,
    vehicle,
    relations,
    lineItems: mapLineItems(inv.lineItems, totalCents, input.orgTax),
    payments: mapPayments(inv.payments),
    documents: documentsView.documents,
    outboundEmails: mapOutboundEmails(input.outboundEmails),
    linkedTasks: mapTasks(inv.tasks),
    notes: inv.notes ?? '',
    provenance: (() => {
      const mapped = mapInvoiceProvenance(inv, input.createdByActor ?? null);
      if (mapped.createdByUserId && !input.createdByActor) {
        return { ...mapped, createdByUserId: null, createdByUserDisplayName: null };
      }
      return mapped;
    })(),
    timeline: mapTimeline(input.timeline),
    capabilities,
  };
}
