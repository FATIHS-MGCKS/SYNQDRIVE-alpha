// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { LanguageProvider } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { InvoiceListMobileCards } from './InvoiceListMobileCards';
import type { InvoiceListItem } from './invoiceTypes';

const item: InvoiceListItem = {
  id: 'inv-1',
  invoiceNumber: '2026-0042',
  type: 'OUTGOING_BOOKING',
  direction: 'outgoing',
  status: 'OVERDUE',
  title: 'Buchung',
  customerDisplayName: 'Anna Schmidt',
  customerId: 'cust-1',
  supplierDisplayName: null,
  supplierId: null,
  bookingNumber: 'BK-555555',
  bookingId: 'book-1',
  vehicleDisplayName: 'VW Golf',
  licensePlate: 'B-AB 123',
  invoiceDate: '2026-07-01T00:00:00.000Z',
  dueDate: '2026-07-05T00:00:00.000Z',
  totalGross: 25000,
  paidAmount: 5000,
  outstandingAmount: 20000,
  currency: 'EUR',
  documentStatus: 'GENERATED',
  activeDocumentId: 'doc-1',
  lastSendStatus: 'SENT',
  lastSentAt: null,
  isOverdue: true,
  sourceType: 'BOOKING',
  creationChannel: 'Buchung',
  openTaskCount: 0,
  hasOpenTask: false,
};

describe('InvoiceListMobileCards', () => {
  it('shows prominent number, status, customer and amounts', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <InvoiceListMobileCards items={[item]} onSelect={vi.fn()} />
      </LanguageProvider>,
    );
    expect(html).toContain('2026-0042');
    expect(html).toContain('Anna Schmidt');
    expect(html).toContain(de['invoices.list.status.OVERDUE']);
    expect(html).toContain('BK-555555');
    expect(html).toContain(de['invoices.list.col.outstanding']);
    expect(html).toContain(de['invoices.list.col.total']);
  });

  it('uses button elements for accessible row activation', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <InvoiceListMobileCards items={[item]} onSelect={vi.fn()} />
      </LanguageProvider>,
    );
    expect(html).toContain('<button');
    expect(html).toContain('focus-visible:ring-2');
  });
});
