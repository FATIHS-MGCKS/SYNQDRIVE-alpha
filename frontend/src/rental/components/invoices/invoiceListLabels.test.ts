import { describe, expect, it } from 'vitest';

import { de } from '../../../i18n/translations/de';
import { en } from '../../../i18n/translations/en';
import {
  counterpartyDisplayName,
  documentStatusLabel,
  sendStatusLabel,
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
    expect(counterpartyDisplayName(sample, 'de')).toBe('Max Mustermann');
  });

  it('formats vehicle line with plate', () => {
    expect(vehicleDisplayLine(sample, 'de')).toBe('BMW 320d · KS-SD 100');
  });

  it('localizes technical enums via locale', () => {
    expect(documentStatusLabel('de', 'GENERATED')).toBe(de['invoices.list.documentStatus.GENERATED']);
    expect(documentStatusLabel('de', null)).toBe(de['invoices.list.documentStatus.none']);
    expect(sendStatusLabel('de', 'FAILED')).toBe(de['invoices.list.sendStatus.FAILED']);
    expect(sendStatusLabel('de', null)).toBe(de['invoices.list.sendStatus.none']);
    expect(documentStatusLabel('en', 'GENERATED')).toBe(en['invoices.list.documentStatus.GENERATED']);
  });
});
