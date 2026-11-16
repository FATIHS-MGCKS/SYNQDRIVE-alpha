import { describe, expect, it, vi } from 'vitest';
import { fetchProductManagementOrgPage } from './product-management-org-list';

const listOperational = vi.fn();

vi.mock('../../../lib/api', () => ({
  api: {
    organizations: {
      listOperational: (...args: unknown[]) => listOperational(...args),
    },
  },
}));

describe('fetchProductManagementOrgPage', () => {
  it('drops stale responses when a newer request was started', async () => {
    listOperational.mockResolvedValueOnce({
      data: [{ id: 'slow' }],
      meta: { total: 1, page: 1, limit: 25, totalPages: 1 },
    });
    const slow = fetchProductManagementOrgPage({ page: 1, limit: 25 }, 1, () => true);
    listOperational.mockResolvedValueOnce({
      data: [{ id: 'fast' }],
      meta: { total: 30, page: 2, limit: 25, totalPages: 2 },
    });
    const fast = await fetchProductManagementOrgPage({ page: 2, limit: 25 }, 2, (id) => id !== 2);
    const slowResult = await slow;
    expect(slowResult).toBeNull();
    expect(fast?.data[0].id).toBe('fast');
    expect(fast?.meta.totalPages).toBe(2);
  });
});