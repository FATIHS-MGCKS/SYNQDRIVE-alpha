// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { LanguageProvider } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
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

function renderList(props: React.ComponentProps<typeof InvoiceList>) {
  return renderToStaticMarkup(
    <LanguageProvider>
      <InvoiceList {...props} />
    </LanguageProvider>,
  );
}

describe('InvoiceList', () => {
  it('renders empty state when no items match filters', () => {
    const html = renderList({
      items: [],
      loading: false,
      error: null,
      hasActiveFilters: true,
      searchTerm: 'test',
      meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
      onSelect: vi.fn(),
      onRetry: vi.fn(),
      onPageChange: vi.fn(),
      onClearFilters: vi.fn(),
    });
    expect(html).toContain(de['invoices.list.empty.title']);
    expect(html).toContain(de['invoices.list.empty.clearFilters']);
  });

  it('renders error state with retry action', () => {
    const html = renderList({
      items: [],
      loading: false,
      error: 'Netzwerkfehler',
      hasActiveFilters: false,
      searchTerm: '',
      meta: null,
      onSelect: vi.fn(),
      onRetry: vi.fn(),
      onPageChange: vi.fn(),
      onClearFilters: vi.fn(),
    });
    expect(html).toContain(de['invoices.list.error.loadFailed']);
    expect(html).toContain(de['invoices.list.retry']);
  });

  it('renders desktop table headers and mobile card content', () => {
    const html = renderList({
      items: [item],
      loading: false,
      error: null,
      hasActiveFilters: false,
      searchTerm: '',
      meta: { total: 40, page: 1, limit: 20, totalPages: 2 },
      onSelect: vi.fn(),
      onRetry: vi.fn(),
      onPageChange: vi.fn(),
      onClearFilters: vi.fn(),
    });
    expect(html).toContain(de['invoices.list.col.invoiceNumber']);
    expect(html).toContain(de['invoices.list.col.party']);
    expect(html).toContain(de['invoices.list.col.send']);
    expect(html).toContain('2026-0001');
    expect(html).toContain('Max Mustermann');
    expect(html).toContain(de['invoices.list.pagination.page'].replace('{page}', '1').replace('{totalPages}', '2'));
  });
});
