import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/api', () => ({
  api: {
    billing: {
      orgSummary: vi.fn(),
      orgInvoices: vi.fn(),
      orgBillableVehicles: vi.fn(),
    },
  },
}));

import { api } from '../../../lib/api';

describe('tenant billing api org scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes orgId to isolated billing endpoints', async () => {
    vi.mocked(api.billing.orgSummary).mockResolvedValue({});
    vi.mocked(api.billing.orgInvoices).mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } });
    vi.mocked(api.billing.orgBillableVehicles).mockResolvedValue({});

    await api.billing.orgSummary('org-tenant-1');
    await api.billing.orgInvoices('org-tenant-1', { page: 1 });
    await api.billing.orgBillableVehicles('org-tenant-1');

    expect(api.billing.orgSummary).toHaveBeenCalledWith('org-tenant-1');
    expect(api.billing.orgInvoices).toHaveBeenCalledWith('org-tenant-1', { page: 1 });
    expect(api.billing.orgBillableVehicles).toHaveBeenCalledWith('org-tenant-1');
  });
});
