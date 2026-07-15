import { describe, expect, it } from 'vitest';
import {
  billingQueryKeys,
  buildBillingQueryParams,
  isAbortError,
  parseBillingPaginated,
  serializeBillingQueryKey,
} from './billing-query.utils';

describe('parseBillingPaginated', () => {
  it('reads meta.total from paginated backend payload', () => {
    const parsed = parseBillingPaginated<{ id: string }>({
      data: [{ id: 'inv-1' }],
      meta: { total: 42, page: 2, limit: 20, totalPages: 3 },
    });

    expect(parsed.meta.total).toBe(42);
    expect(parsed.meta.page).toBe(2);
    expect(parsed.data).toHaveLength(1);
  });

  it('returns empty result for missing payload', () => {
    const parsed = parseBillingPaginated(undefined);
    expect(parsed.data).toEqual([]);
    expect(parsed.meta.total).toBe(0);
    expect(parsed.meta.totalPages).toBe(0);
  });

  it('supports legacy array payloads', () => {
    const parsed = parseBillingPaginated([{ id: 'a' }, { id: 'b' }]);
    expect(parsed.data).toHaveLength(2);
    expect(parsed.meta.total).toBe(2);
  });
});

describe('billing query serialization', () => {
  it('omits empty filter values', () => {
    expect(
      buildBillingQueryParams({
        page: 2,
        pageSize: 20,
        search: '',
        status: undefined,
      }),
    ).toEqual({ page: '2', pageSize: '20' });
  });

  it('creates stable query keys for pagination and filters', () => {
    const key = serializeBillingQueryKey({
      page: 2,
      pageSize: 10,
      search: 'RE-2026',
      sort: '-invoiceDate',
    });
    expect(key).toContain('RE-2026');
    expect(billingQueryKeys.invoices('org-a', key)).toEqual([
      'billing',
      'invoices',
      'org-a',
      key,
    ]);
  });
});

describe('isAbortError', () => {
  it('detects DOMException abort errors', () => {
    expect(isAbortError(new DOMException('Aborted', 'AbortError'))).toBe(true);
    expect(isAbortError(new Error('other'))).toBe(false);
  });
});
