import { describe, expect, it, vi, beforeEach } from 'vitest';
import { changeCustomerStatus, changeCustomerRisk } from './customer-mutations.utils';

vi.mock('../../lib/api', () => ({
  api: {
    customers: {
      updateStatus: vi.fn(),
      updateRisk: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { api } from '../../lib/api';

describe('customer-mutations.utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes suspend through updateStatus with API enum', async () => {
    vi.mocked(api.customers.updateStatus).mockResolvedValue({ id: 'c1', status: 'SUSPENDED' } as never);

    await changeCustomerStatus('org-1', 'c1', 'Suspended', 'Policy violation');

    expect(api.customers.updateStatus).toHaveBeenCalledWith('org-1', 'c1', {
      status: 'SUSPENDED',
      reason: 'Policy violation',
    });
    expect(api.customers.update).not.toHaveBeenCalled();
  });

  it('routes reactivate through updateStatus', async () => {
    vi.mocked(api.customers.updateStatus).mockResolvedValue({ id: 'c1', status: 'ACTIVE' } as never);

    await changeCustomerStatus('org-1', 'c1', 'Active');

    expect(api.customers.updateStatus).toHaveBeenCalledWith('org-1', 'c1', { status: 'ACTIVE' });
    expect(api.customers.update).not.toHaveBeenCalled();
  });

  it('routes risk changes through updateRisk', async () => {
    vi.mocked(api.customers.updateRisk).mockResolvedValue({ id: 'c1', riskLevel: 'HIGH' } as never);

    await changeCustomerRisk('org-1', 'c1', 'HIGH', 'Multiple incidents');

    expect(api.customers.updateRisk).toHaveBeenCalledWith('org-1', 'c1', {
      riskLevel: 'HIGH',
      riskReason: 'Multiple incidents',
    });
    expect(api.customers.update).not.toHaveBeenCalled();
  });
});
