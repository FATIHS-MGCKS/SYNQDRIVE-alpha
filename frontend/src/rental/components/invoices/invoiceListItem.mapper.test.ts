import { describe, expect, it } from 'vitest';

import { mapInvoiceListItemToInvoiceRow } from './invoiceListItem.mapper';
import type { InvoiceListItem } from './invoiceTypes';

const sampleItem: InvoiceListItem = {
  id: 'inv-1',
  invoiceNumber: '2026-0001',
  type: 'OUTGOING_MANUAL',
  direction: 'outgoing',
  status: 'ISSUED',
  title: 'Wartung',
  customerDisplayName: 'Max Mustermann',
  customerId: 'cust-1',
  supplierDisplayName: null,
  supplierId: null,
  bookingNumber: 'BK-234567',
  bookingId: 'book-1',
  vehicleDisplayName: 'BMW 320d',
  licensePlate: 'KS-SD 100',
  invoiceDate: '2026-07-01T00:00:00.000Z',
  dueDate: '2026-07-10T00:00:00.000Z',
  totalGross: 11900,
  paidAmount: 0,
  outstandingAmount: 11900,
  currency: 'EUR',
  documentStatus: 'GENERATED',
  activeDocumentId: 'doc-1',
  lastSendStatus: 'SENT',
  lastSentAt: '2026-07-02T00:00:00.000Z',
  isOverdue: true,
  sourceType: 'MANUAL',
  creationChannel: 'Rechnungsstellung',
  openTaskCount: 1,
  hasOpenTask: true,
};

describe('mapInvoiceListItemToInvoiceRow', () => {
  it('maps read-model fields to legacy invoice list row', () => {
    const row = mapInvoiceListItemToInvoiceRow(sampleItem);
    expect(row.invoiceNumberDisplay).toBe('2026-0001');
    expect(row.vendorName).toBe('Max Mustermann');
    expect(row.totalCents).toBe(11900);
    expect(row.generatedDocumentId).toBe('doc-1');
    expect(row.tasks?.[0]?.status).toBe('OPEN');
  });
});
