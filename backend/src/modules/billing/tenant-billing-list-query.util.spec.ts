import { parseTenantBillingListQuery } from './tenant-billing-list-query.util';

describe('parseTenantBillingListQuery', () => {
  it('uses pageSize and caps limit at 100', () => {
    const parsed = parseTenantBillingListQuery({ page: 2, pageSize: 200 });
    expect(parsed.page).toBe(2);
    expect(parsed.limit).toBe(100);
    expect(parsed.skip).toBe(100);
    expect(parsed.take).toBe(100);
  });

  it('parses sort with direction suffix', () => {
    const parsed = parseTenantBillingListQuery(
      { sort: 'invoiceDate:asc' },
      { allowedSortFields: ['invoiceDate'], defaultSortField: 'invoiceDate' },
    );
    expect(parsed.sortField).toBe('invoiceDate');
    expect(parsed.sortOrder).toBe('asc');
  });

  it('parses negative sort prefix as desc', () => {
    const parsed = parseTenantBillingListQuery(
      { sort: '-dueDate' },
      { allowedSortFields: ['dueDate'], defaultSortField: 'dueDate' },
    );
    expect(parsed.sortField).toBe('dueDate');
    expect(parsed.sortOrder).toBe('desc');
  });

  it('falls back to default sort for unknown field', () => {
    const parsed = parseTenantBillingListQuery(
      { sort: 'unknown' },
      {
        allowedSortFields: ['invoiceDate'],
        defaultSortField: 'invoiceDate',
        defaultSortOrder: 'desc',
      },
    );
    expect(parsed.sortField).toBe('invoiceDate');
    expect(parsed.sortOrder).toBe('desc');
  });
});
