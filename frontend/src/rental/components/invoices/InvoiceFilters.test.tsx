import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { InvoiceFilters } from './InvoiceFilters';
import { DEFAULT_INVOICE_LIST_FILTERS } from './invoiceListState';
import { getInvoiceThemeClasses } from './invoiceTheme';

describe('InvoiceFilters', () => {
  const theme = getInvoiceThemeClasses(false);
  const baseProps = {
    ...theme,
    filters: DEFAULT_INVOICE_LIST_FILTERS,
    onPatchFilters: vi.fn(),
    searchTerm: '',
    onSearchTermChange: vi.fn(),
    stations: [{ id: 'st-1', name: 'Kassel', organizationId: 'org-1' } as never],
    filteredCount: 3,
    totalCount: 10,
    statusCount: () => 1,
    directionCount: () => 2,
    stationLabel: null,
    hasActiveFilters: false,
    onClearFilters: vi.fn(),
  };

  it('renders search input and filter controls in German', () => {
    const html = renderToStaticMarkup(<InvoiceFilters {...baseProps} />);
    expect(html).toContain('aria-label="Rechnungen durchsuchen"');
    expect(html).toContain('Dokumentstatus filtern');
    expect(html).toContain('Versandstatus filtern');
    expect(html).toContain('Station filtern');
  });

  it('shows active filter chips when filters are applied', () => {
    const html = renderToStaticMarkup(
      <InvoiceFilters
        {...baseProps}
        hasActiveFilters
        filters={{ ...DEFAULT_INVOICE_LIST_FILTERS, status: 'PAID' }}
      />,
    );
    expect(html).toContain('Aktive Filter');
    expect(html).toContain('Bezahlt');
    expect(html).toContain('Filter zurücksetzen');
  });
});
