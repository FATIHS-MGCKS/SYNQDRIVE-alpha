import type { Invoice, InvoiceListItem } from './invoiceTypes';

/** Maps list read-model rows to the legacy Invoice shape used by list components. */
export function mapInvoiceListItemToInvoiceRow(item: InvoiceListItem): Invoice {
  return {
    id: item.id,
    invoiceNumber: null,
    invoiceNumberDisplay: item.invoiceNumber,
    type: item.type,
    customerId: item.customerId,
    vendorId: item.supplierId,
    vendorName: item.supplierDisplayName ?? item.customerDisplayName,
    bookingId: item.bookingId,
    vehicleId: null,
    title: item.title,
    description: '',
    lineItems: null,
    subtotalCents: item.totalGross,
    taxCents: 0,
    totalCents: item.totalGross,
    paidCents: item.paidAmount,
    outstandingCents: item.outstandingAmount,
    currency: item.currency,
    invoiceDate: item.invoiceDate,
    dueDate: item.dueDate,
    status: item.status,
    templateId: null,
    imageUrl: null,
    extractedData: null,
    generatedDocumentId: item.activeDocumentId,
    notes: '',
    paidAt: null,
    createdAt: item.invoiceDate,
    tasks: item.hasOpenTask
      ? [{ id: `${item.id}-task`, title: 'Offen', status: 'OPEN' }]
      : item.status === 'PAID'
        ? []
        : undefined,
  };
}
