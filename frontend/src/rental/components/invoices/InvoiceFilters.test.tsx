// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { LanguageProvider } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
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

  it('renders search input and filter controls', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <InvoiceFilters {...baseProps} />
      </LanguageProvider>,
    );
    expect(html).toContain(de['invoices.list.filters.searchAria']);
    expect(html).toContain(de['invoices.list.filters.documentAria']);
    expect(html).toContain(de['invoices.list.filters.sendAria']);
    expect(html).toContain(de['invoices.list.filters.stationAria']);
  });

  it('shows active filter chips when filters are applied', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <InvoiceFilters
          {...baseProps}
          hasActiveFilters
          filters={{ ...DEFAULT_INVOICE_LIST_FILTERS, status: 'PAID' }}
        />
      </LanguageProvider>,
    );
    expect(html).toContain(de['invoices.list.filters.activeAria']);
    expect(html).toContain(de['invoices.list.status.PAID']);
    expect(html).toContain(de['invoices.list.filters.clear']);
  });
});
