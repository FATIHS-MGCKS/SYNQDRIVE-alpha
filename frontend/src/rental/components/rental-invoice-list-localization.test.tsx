// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  api: {
    invoices: {
      listItems: vi.fn(async () => ({
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
      })),
      stats: vi.fn(async () => ({
        total: 0,
        outgoing: 0,
        incoming: 0,
        unpaid: 0,
        overdue: 0,
        totalRevenueCents: 0,
        totalExpensesCents: 0,
        statusCounts: {},
      })),
    },
    stations: {
      list: vi.fn(async () => []),
    },
  },
}));

vi.mock('../RentalContext', () => ({
  useRentalOrg: () => ({
    orgId: 'org-1',
    hasPermission: () => true,
  }),
}));

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import {
  buildInvoiceListApiParams,
  DEFAULT_INVOICE_LIST_FILTERS,
} from './invoices/invoiceListState';
import { InvoiceFilters } from './invoices/InvoiceFilters';
import { InvoiceList } from './invoices/InvoiceList';
import { getInvoiceThemeClasses } from './invoices/invoiceTheme';
import {
  formatInvoiceListAmount,
  formatInvoiceListDate,
  INVOICE_DIRECTION_VALUES,
  INVOICE_SORT_VALUES,
  INVOICE_STATUS_FILTER_OPTIONS,
  labelInvoiceListDocumentStatus,
  labelInvoiceListSendStatus,
  labelInvoiceListSortField,
  labelInvoiceListStatus,
} from '../lib/invoice-list-i18n';
import { InvoicesPage } from './invoices/InvoicesPage';

const __dirname = dirname(fileURLToPath(import.meta.url));

const P214_ENFORCE_CLEAN_EXACT = [
  'rental/components/invoices/InvoicesPage.tsx',
  'rental/components/invoices/InvoiceList.tsx',
  'rental/components/invoices/InvoiceListTable.tsx',
  'rental/components/invoices/InvoiceListMobileCards.tsx',
  'rental/components/invoices/InvoiceListPagination.tsx',
  'rental/components/invoices/InvoiceFilters.tsx',
  'rental/components/invoices/InvoiceKpiGrid.tsx',
  'rental/components/invoices/InvoiceKpiCard.tsx',
  'rental/components/invoices/hooks/useInvoices.ts',
  'rental/components/invoices/invoiceListLabels.ts',
  'rental/components/invoices/invoiceConstants.ts',
  'rental/lib/invoice-list-i18n.ts',
];

function isP214EnforceCleanPath(relPath: string): boolean {
  return P214_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p214ScopedFindings() {
  return inventory.findings.filter((finding) => isP214EnforceCleanPath(finding.file));
}

function renderWithLocale(locale: 'de' | 'en', ui: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  window.localStorage.setItem('synqdrive.locale', locale);
  act(() => {
    root.render(createElement(LanguageProvider, null, ui));
  });
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('rental Invoice List localization (P2.2.14)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  describe('enforce-clean inventory', () => {
    it('reports zero P214 scoped findings', () => {
      expect(p214ScopedFindings()).toHaveLength(0);
    });
  });

  describe('machine semantics', () => {
    it('preserves invoice status filter machine values', () => {
      expect(INVOICE_STATUS_FILTER_OPTIONS).toContain('ISSUED');
      expect(INVOICE_STATUS_FILTER_OPTIONS[0]).toBe('all');
    });

    it('preserves sort and direction machine values', () => {
      expect(INVOICE_SORT_VALUES).toEqual([
        'invoiceDate',
        'dueDate',
        'totalGross',
        'status',
        'createdAt',
      ]);
      expect(INVOICE_DIRECTION_VALUES).toEqual(['all', 'outgoing', 'incoming']);
    });

    it('builds identical API params regardless of locale labels', () => {
      const filters = {
        ...DEFAULT_INVOICE_LIST_FILTERS,
        status: 'OVERDUE',
        type: 'OUTGOING_MANUAL',
        sendStatus: 'SENT' as const,
        sortBy: 'dueDate' as const,
        sortOrder: 'asc' as const,
        direction: 'outgoing' as const,
      };
      const params = buildInvoiceListApiParams(filters, 'ACME');
      expect(params.status).toBe('OVERDUE');
      expect(params.type).toBe('OUTGOING_MANUAL');
      expect(params.sendStatus).toBe('SENT');
      expect(params.sortBy).toBe('dueDate');
      expect(params.sortOrder).toBe('asc');
      expect(params.direction).toBe('outgoing');
    });

    it('localizes status labels without changing machine keys', () => {
      expect(labelInvoiceListStatus('en', 'ISSUED')).toBe(en['invoices.list.status.ISSUED']);
      expect(labelInvoiceListStatus('de', 'OVERDUE')).toBe(de['invoices.list.status.OVERDUE']);
    });

    it('localizes document and send status presentation', () => {
      expect(labelInvoiceListDocumentStatus('en', 'GENERATED')).toBe(
        en['invoices.list.documentStatus.GENERATED'],
      );
      expect(labelInvoiceListSendStatus('de', 'FAILED')).toBe(de['invoices.list.sendStatus.FAILED']);
    });

    it('uses locale-aware amount formatting without changing numeric cents', () => {
      const cents = 11900;
      expect(formatInvoiceListAmount('de', cents)).toContain('119');
      expect(formatInvoiceListAmount('en', cents)).toMatch(/119/);
    });

    it('uses locale-aware date formatting', () => {
      const formattedDe = formatInvoiceListDate('de', '2026-07-01T00:00:00.000Z');
      const formattedEn = formatInvoiceListDate('en', '2026-07-01T00:00:00.000Z');
      expect(formattedDe).toMatch(/2026/);
      expect(formattedEn).toMatch(/2026/);
    });
  });

  describe('InvoiceList rendering', () => {
    it('renders EN empty state without German literals', async () => {
      const view = renderWithLocale(
        'en',
        createElement(InvoiceList, {
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
        }),
      );
      cleanup = view.cleanup;
      await act(async () => {});
      expect(view.container.textContent).toContain(en['invoices.list.empty.title']);
      expect(view.container.textContent).not.toMatch(/Keine Rechnungen|Filter zurücksetzen/);
    });

    it('renders DE empty state with German dictionary strings', async () => {
      const view = renderWithLocale(
        'de',
        createElement(InvoiceList, {
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
        }),
      );
      cleanup = view.cleanup;
      await act(async () => {});
      expect(view.container.textContent).toContain(de['invoices.list.empty.title']);
      expect(view.container.textContent).toContain(de['invoices.list.empty.clearFilters']);
    });

    it('renders EN error state with retry label', async () => {
      const view = renderWithLocale(
        'en',
        createElement(InvoiceList, {
          items: [],
          loading: false,
          error: 'Network error',
          hasActiveFilters: false,
          searchTerm: '',
          meta: null,
          onSelect: vi.fn(),
          onRetry: vi.fn(),
          onPageChange: vi.fn(),
          onClearFilters: vi.fn(),
        }),
      );
      cleanup = view.cleanup;
      await act(async () => {});
      expect(view.container.textContent).toContain(en['invoices.list.error.loadFailed']);
      expect(view.container.textContent).toContain(en['invoices.list.retry']);
    });
  });

  describe('InvoiceFilters rendering', () => {
    const theme = getInvoiceThemeClasses(false);
    const baseProps = {
      ...theme,
      filters: DEFAULT_INVOICE_LIST_FILTERS,
      onPatchFilters: vi.fn(),
      searchTerm: '',
      onSearchTermChange: vi.fn(),
      stations: [],
      filteredCount: 0,
      totalCount: 0,
      statusCount: () => 0,
      directionCount: () => 0,
      stationLabel: null,
      hasActiveFilters: false,
      onClearFilters: vi.fn(),
    };

    it('renders EN filter labels', async () => {
      const view = renderWithLocale('en', createElement(InvoiceFilters, baseProps));
      cleanup = view.cleanup;
      await act(async () => {});
      expect(view.container.textContent).toContain(en['invoices.list.filters.title']);
      expect(view.container.textContent).toContain(labelInvoiceListSortField('en', 'invoiceDate'));
    });

    it('renders DE filter labels and sort options', async () => {
      const view = renderWithLocale('de', createElement(InvoiceFilters, baseProps));
      cleanup = view.cleanup;
      await act(async () => {});
      expect(view.container.textContent).toContain(de['invoices.list.filters.title']);
      expect(view.container.textContent).toContain(labelInvoiceListSortField('de', 'dueDate'));
    });

    it('keeps filter option values as machine keys in source', () => {
      const source = readFileSync(join(__dirname, 'invoices/InvoiceFilters.tsx'), 'utf8');
      expect(source).toContain('value={filters.status}');
      expect(source).toContain('INVOICE_STATUS_FILTER_OPTIONS.map');
      expect(source).not.toContain("value={t('invoices.list.status");
    });
  });

  describe('InvoicesPage list surface', () => {
    it('renders EN invoices page list chrome', async () => {
      const view = renderWithLocale(
        'en',
        createElement(InvoicesPage, { isDarkMode: false }),
      );
      cleanup = view.cleanup;
      await act(async () => {});
      expect(view.container.textContent).toContain(en['nav.customerInvoices']);
      expect(view.container.textContent).toContain(en['invoices.list.action.create']);
      expect(view.container.textContent).toContain(en['invoices.list.kpi.total']);
    });
  });

  describe('blind-spot guard', () => {
    it('keeps invoice-list-i18n free of inline German presentation strings', () => {
      const source = readFileSync(join(__dirname, '../lib/invoice-list-i18n.ts'), 'utf8');
      expect(source).not.toMatch(/'Entwurf'/);
      expect(source).not.toMatch(/'Rechnungsdatum'/);
      expect(source).toContain('invoices.list.status.');
    });

    it('keeps invoiceConstants.ts free of presentation literals', () => {
      const source = readFileSync(join(__dirname, 'invoices/invoiceConstants.ts'), 'utf8');
      expect(source).not.toMatch(/label:/);
      expect(source).not.toMatch(/Buchungsrechnung/);
    });
  });
});
