import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { InvoiceList } from './InvoiceList';
import type { InvoiceListItem } from './invoiceTypes';

const item: InvoiceListItem = {
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

describe('InvoiceList', () => {
  it('renders empty state when no items match filters', () => {
    const html = renderToStaticMarkup(
      <InvoiceList
        items={[]}
        loading={false}
        error={null}
        hasActiveFilters
        searchTerm="test"
        meta={{ total: 0, page: 1, limit: 20, totalPages: 0 }}
        onSelect={vi.fn()}
        onRetry={vi.fn()}
        onPageChange={vi.fn()}
        onClearFilters={vi.fn()}
      />,
    );
    expect(html).toContain('Keine Rechnungen gefunden');
    expect(html).toContain('Filter zurücksetzen');
  });

  it('renders error state with retry action', () => {
    const html = renderToStaticMarkup(
      <InvoiceList
        items={[]}
        loading={false}
        error="Netzwerkfehler"
        hasActiveFilters={false}
        searchTerm=""
        meta={null}
        onSelect={vi.fn()}
        onRetry={vi.fn()}
        onPageChange={vi.fn()}
        onClearFilters={vi.fn()}
      />,
    );
    expect(html).toContain('Rechnungen konnten nicht geladen werden');
    expect(html).toContain('Erneut laden');
  });

  it('renders desktop table headers and mobile card content', () => {
    const html = renderToStaticMarkup(
      <InvoiceList
        items={[item]}
        loading={false}
        error={null}
        hasActiveFilters={false}
        searchTerm=""
        meta={{ total: 40, page: 1, limit: 20, totalPages: 2 }}
        onSelect={vi.fn()}
        onRetry={vi.fn()}
        onPageChange={vi.fn()}
        onClearFilters={vi.fn()}
      />,
    );
    expect(html).toContain('Rechnungsnr.');
    expect(html).toContain('Kunde / Lieferant');
    expect(html).toContain('Versand');
    expect(html).toContain('2026-0001');
    expect(html).toContain('Max Mustermann');
    expect(html).toContain('Seite 1 / 2');
  });
});
