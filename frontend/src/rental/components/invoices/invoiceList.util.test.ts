import { describe, expect, it } from 'vitest';

import {
  countInvoicesByDirection,
  countInvoicesByStatus,
  filterInvoices,
} from './invoiceList.util';
import type { Invoice } from './invoiceTypes';

const baseInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'inv-1',
  invoiceNumber: 1,
  invoiceNumberDisplay: '#1',
  type: 'OUTGOING_MANUAL',
  customerId: null,
  vendorId: null,
  vendorName: null,
  bookingId: null,
  vehicleId: null,
  title: 'Mietrechnung',
  description: '',
  lineItems: null,
  subtotalCents: 10000,
  taxCents: 1900,
  totalCents: 11900,
  paidCents: 0,
  outstandingCents: 11900,
  currency: 'EUR',
  invoiceDate: '2026-07-01',
  dueDate: '2026-07-15',
  status: 'ISSUED',
  templateId: null,
  imageUrl: null,
  extractedData: null,
  notes: '',
  paidAt: null,
  createdAt: '2026-07-01T10:00:00Z',
  ...overrides,
});

describe('invoiceList.util', () => {
  const invoices = [
    baseInvoice({ id: 'a', status: 'ISSUED', type: 'OUTGOING_MANUAL', title: 'Ausgang A' }),
    baseInvoice({
      id: 'b',
      status: 'PAID',
      type: 'INCOMING_VENDOR',
      title: 'Werkstatt',
      vendorName: 'Garage Müller',
    }),
    baseInvoice({ id: 'c', status: 'OVERDUE', type: 'OUTGOING_BOOKING', title: 'Buchung C' }),
  ];

  it('filters by search term across title, number, and vendor', () => {
    expect(filterInvoices(invoices, 'garage', 'all', 'all')).toHaveLength(1);
    expect(filterInvoices(invoices, '#1', 'all', 'all').length).toBeGreaterThan(0);
    expect(filterInvoices(invoices, 'buchung', 'all', 'all')).toHaveLength(1);
  });

  it('filters by status and direction', () => {
    expect(filterInvoices(invoices, '', 'PAID', 'all')).toHaveLength(1);
    expect(filterInvoices(invoices, '', 'all', 'incoming')).toHaveLength(1);
    expect(filterInvoices(invoices, '', 'all', 'outgoing')).toHaveLength(2);
  });

  it('counts by status and direction', () => {
    expect(countInvoicesByStatus(invoices, 'all')).toBe(3);
    expect(countInvoicesByStatus(invoices, 'OVERDUE')).toBe(1);
    expect(countInvoicesByDirection(invoices, 'incoming')).toBe(1);
    expect(countInvoicesByDirection(invoices, 'outgoing')).toBe(2);
  });
});
