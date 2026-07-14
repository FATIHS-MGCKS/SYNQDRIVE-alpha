import { describe, expect, it } from 'vitest';

import {
  counterpartyDisplayName,
  documentStatusLabelDe,
  sendStatusLabelDe,
  vehicleDisplayLine,
} from './invoiceListLabels';
import type { InvoiceListItem } from './invoiceTypes';

const sample: InvoiceListItem = {
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
  lastSentAt: null,
  isOverdue: true,
  sourceType: 'MANUAL',
  creationChannel: 'Rechnungsstellung',
  openTaskCount: 0,
  hasOpenTask: false,
};

describe('invoiceListLabels', () => {
  it('prefers customer for outgoing counterparty', () => {
    expect(counterpartyDisplayName(sample)).toBe('Max Mustermann');
  });

  it('formats vehicle line with plate', () => {
    expect(vehicleDisplayLine(sample)).toBe('BMW 320d · KS-SD 100');
  });

  it('localizes technical enums', () => {
    expect(documentStatusLabelDe('GENERATED')).toBe('Erstellt');
    expect(documentStatusLabelDe(null)).toBe('Kein Dokument');
    expect(sendStatusLabelDe('FAILED')).toBe('Fehlgeschlagen');
    expect(sendStatusLabelDe(null)).toBe('Nicht versendet');
  });
});
