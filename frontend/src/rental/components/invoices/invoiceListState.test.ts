import { describe, expect, it } from 'vitest';

import {
  buildInvoiceListApiParams,
  DEFAULT_INVOICE_LIST_FILTERS,
  hasActiveInvoiceListFilters,
  paginationLabel,
} from './invoiceListState';

describe('invoiceListState', () => {
  it('builds server query params from filters', () => {
    const params = buildInvoiceListApiParams(
      {
        ...DEFAULT_INVOICE_LIST_FILTERS,
        direction: 'outgoing',
        status: 'ISSUED',
        type: 'OUTGOING_MANUAL',
        documentStatus: 'present',
        sendStatus: 'SENT',
        stationId: 'station-1',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-31',
        overdue: true,
        page: 2,
        limit: 20,
        sortBy: 'dueDate',
        sortOrder: 'asc',
      },
      'Mustermann',
    );

    expect(params).toMatchObject({
      page: 2,
      limit: 20,
      search: 'Mustermann',
      direction: 'outgoing',
      status: 'ISSUED',
      type: 'OUTGOING_MANUAL',
      documentStatus: 'present',
      sendStatus: 'SENT',
      stationId: 'station-1',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
      overdue: true,
      sortBy: 'dueDate',
      sortOrder: 'asc',
    });
  });

  it('detects active filters', () => {
    expect(hasActiveInvoiceListFilters(DEFAULT_INVOICE_LIST_FILTERS, '')).toBe(false);
    expect(
      hasActiveInvoiceListFilters(
        { ...DEFAULT_INVOICE_LIST_FILTERS, documentStatus: 'missing' },
        '',
      ),
    ).toBe(true);
    expect(hasActiveInvoiceListFilters(DEFAULT_INVOICE_LIST_FILTERS, 'ACME')).toBe(true);
  });

  it('formats pagination label', () => {
    expect(
      paginationLabel({ total: 42, page: 2, limit: 20, totalPages: 3 }),
    ).toBe('21–40 von 42');
  });
});
