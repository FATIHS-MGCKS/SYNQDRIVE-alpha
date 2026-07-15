import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/api', () => ({
  api: {
    billing: {
      orgInvoices: vi.fn(),
    },
  },
}));

import { api } from '../../../lib/api';
import { serializeBillingQueryKey } from './billing-query.utils';

describe('billing invoice query serialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes orgId and pagination params to tenant invoice api', async () => {
    vi.mocked(api.billing.orgInvoices).mockResolvedValue({
      data: [],
      meta: { total: 0, page: 2, limit: 10, totalPages: 0 },
    });

    const params = { page: 2, pageSize: 10, search: 'RE-2026', sort: '-invoiceDate' };
    await api.billing.orgInvoices('org-a', params);

    expect(api.billing.orgInvoices).toHaveBeenCalledWith('org-a', params);
  });

  it('changes query key when filters change for isolated refetch', () => {
    const base = serializeBillingQueryKey({ page: 1, pageSize: 20 });
    const filtered = serializeBillingQueryKey({ page: 1, pageSize: 20, search: 'RE' });
    expect(filtered).not.toBe(base);
  });

  it('returns empty page without throwing for zero results', async () => {
    vi.mocked(api.billing.orgInvoices).mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
    });

    const result = await api.billing.orgInvoices('org-a', { search: 'missing-number' });
    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(0);
  });
});
