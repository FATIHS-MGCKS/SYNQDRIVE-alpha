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
import { fetchTenantBillingData } from './useBillingData';

describe('fetchTenantBillingData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.billing.orgSummary).mockResolvedValue({ subscriptionStatus: 'ACTIVE' });
    vi.mocked(api.billing.orgInvoices).mockResolvedValue({ data: [] });
    vi.mocked(api.billing.orgBillableVehicles).mockResolvedValue({ billableVehicleCount: 0 });
  });

  it('passes orgId to all tenant billing api calls', async () => {
    await fetchTenantBillingData('org-tenant-1');

    expect(api.billing.orgSummary).toHaveBeenCalledWith('org-tenant-1');
    expect(api.billing.orgInvoices).toHaveBeenCalledWith('org-tenant-1');
    expect(api.billing.orgBillableVehicles).toHaveBeenCalledWith('org-tenant-1');
  });
});
