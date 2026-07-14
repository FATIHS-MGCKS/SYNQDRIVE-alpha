import {
  Customer,
  GeneratedDocument,
  OrgInvoice,
  OrgInvoiceType,
  OrgTask,
  OutboundEmail,
  OutboundEmailStatus,
  Vehicle,
  Vendor,
} from '@prisma/client';
import { displayInvoiceNumber } from './invoice-domain.util';
import type { InvoiceListItemDto, InvoiceListSourceType } from './dto/invoice-list-item.dto';
import { invoiceBookingRef } from './utils/invoice-booking-ref.util';
import { invoiceListDirection, isInvoiceOverdue } from './invoice-list-query.util';

type InvoiceListRow = Pick<
  OrgInvoice,
  | 'id'
  | 'type'
  | 'status'
  | 'title'
  | 'customerId'
  | 'vendorId'
  | 'vendorName'
  | 'bookingId'
  | 'vehicleId'
  | 'totalCents'
  | 'paidCents'
  | 'outstandingCents'
  | 'currency'
  | 'invoiceDate'
  | 'dueDate'
  | 'generatedDocumentId'
  | 'documentExtractionId'
  | 'invoiceNumberDisplay'
  | 'legacyInvoiceNumber'
  | 'invoiceNumber'
  | 'sequenceYear'
  | 'sequenceNumber'
>;

export function customerDisplayName(customer: Customer | null | undefined): string | null {
  if (!customer) return null;
  const company = customer.company?.trim();
  if (company) return company;
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
  return name || null;
}

export function vehicleDisplayName(vehicle: Vehicle | null | undefined): string | null {
  if (!vehicle) return null;
  const named = vehicle.vehicleName?.trim();
  if (named) return named;
  const base = [vehicle.make, vehicle.model].filter(Boolean).join(' ').trim();
  return base || null;
}

export function supplierDisplayName(
  vendor: Vendor | null | undefined,
  vendorName: string | null,
): string | null {
  return vendor?.name?.trim() || vendorName?.trim() || null;
}

export function resolveInvoiceSourceType(invoice: InvoiceListRow): InvoiceListSourceType | null {
  if (invoice.documentExtractionId || invoice.type === 'INCOMING_UPLOADED') {
    return 'AI_UPLOAD';
  }
  if (invoice.type === 'OUTGOING_BOOKING') return 'BOOKING';
  if (invoice.type === 'OUTGOING_MANUAL' || invoice.type === 'OUTGOING_FINAL') {
    return 'MANUAL';
  }
  if (invoice.type === 'INCOMING_VENDOR') return 'VENDOR';
  return 'LEGACY';
}

export function resolveInvoiceCreationChannel(
  type: OrgInvoiceType,
  sourceType: InvoiceListSourceType | null,
): string | null {
  switch (sourceType) {
    case 'AI_UPLOAD':
      return 'KI-Upload';
    case 'BOOKING':
      return 'Buchung';
    case 'MANUAL':
      return 'Rechnungsstellung';
    case 'VENDOR':
      return 'Lieferantenverwaltung';
    case 'LEGACY':
      return 'Legacy';
    default:
      return type;
  }
}

export function mapInvoiceListItem(input: {
  invoice: InvoiceListRow;
  customer?: Customer | null;
  vendor?: Vendor | null;
  vehicle?: Vehicle | null;
  document?: GeneratedDocument | null;
  lastEmail?: OutboundEmail | null;
  openTasks?: OrgTask[];
  now?: Date;
}): InvoiceListItemDto {
  const { invoice } = input;
  const outstandingAmount =
    invoice.outstandingCents ?? Math.max(0, invoice.totalCents - invoice.paidCents);
  const sourceType = resolveInvoiceSourceType(invoice);
  const openTasks = (input.openTasks ?? []).filter((t) => t.status !== 'DONE');

  return {
    id: invoice.id,
    invoiceNumber: displayInvoiceNumber({
      invoiceNumberDisplay: invoice.invoiceNumberDisplay,
      legacyInvoiceNumber: invoice.legacyInvoiceNumber ?? invoice.invoiceNumber,
      invoiceNumber: invoice.invoiceNumber,
      sequenceYear: invoice.sequenceYear,
      sequenceNumber: invoice.sequenceNumber,
      status: invoice.status,
    }),
    type: invoice.type,
    direction: invoiceListDirection(invoice.type),
    status: invoice.status,
    title: invoice.title,
    customerDisplayName: customerDisplayName(input.customer),
    customerId: invoice.customerId,
    supplierDisplayName: supplierDisplayName(input.vendor ?? null, invoice.vendorName),
    supplierId: invoice.vendorId,
    bookingNumber: invoice.bookingId ? invoiceBookingRef(invoice.bookingId) : null,
    bookingId: invoice.bookingId,
    vehicleDisplayName: vehicleDisplayName(input.vehicle ?? null),
    licensePlate: input.vehicle?.licensePlate?.trim() || null,
    invoiceDate: invoice.invoiceDate.toISOString(),
    dueDate: invoice.dueDate?.toISOString() ?? null,
    totalGross: invoice.totalCents,
    paidAmount: invoice.paidCents,
    outstandingAmount,
    currency: invoice.currency,
    documentStatus: input.document?.status ?? (invoice.generatedDocumentId ? 'UNKNOWN' : null),
    activeDocumentId: invoice.generatedDocumentId,
    lastSendStatus: (input.lastEmail?.status as OutboundEmailStatus | undefined) ?? null,
    lastSentAt: input.lastEmail?.sentAt?.toISOString() ?? input.lastEmail?.createdAt?.toISOString() ?? null,
    isOverdue: isInvoiceOverdue({
      dueDate: invoice.dueDate,
      outstandingCents: outstandingAmount,
      status: invoice.status,
      now: input.now,
    }),
    sourceType,
    creationChannel: resolveInvoiceCreationChannel(invoice.type, sourceType),
    openTaskCount: openTasks.length,
    hasOpenTask: openTasks.length > 0,
  };
}
