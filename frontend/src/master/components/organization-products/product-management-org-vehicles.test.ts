import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VEHICLE_LIST_MAX_PAGES,
  VEHICLE_LIST_PAGE_SIZE,
  loadOrgVehiclesForProductGrants,
} from './product-management-org-vehicles';

const listByOrg = vi.fn();

vi.mock('../../../lib/api', () => ({
  api: {
    vehicles: {
      listByOrg: (...args: unknown[]) => listByOrg(...args),
    },
  },
}));

describe('loadOrgVehiclesForProductGrants', () => {
  beforeEach(() => {
    listByOrg.mockReset();
  });

  it('reports incomplete when page cap is reached before total', async () => {
    listByOrg.mockImplementation(async (_orgId: string, params?: { page?: number }) => {
      const page = params?.page ?? 1;
      const items = Array.from({ length: VEHICLE_LIST_PAGE_SIZE }, (_, i) => ({
        id: `v-${page}-${i}`,
      }));
      return {
        data: items,
        meta: { total: VEHICLE_LIST_PAGE_SIZE * (VEHICLE_LIST_MAX_PAGES + 1) },
      };
    });
    const result = await loadOrgVehiclesForProductGrants('org-1');
    expect(result.complete).toBe(false);
    expect(result.stoppedReason).toBe('page_cap');
    expect(result.loadedCount).toBe(VEHICLE_LIST_PAGE_SIZE * VEHICLE_LIST_MAX_PAGES);
  });

  it('marks complete when all pages fit within cap', async () => {
    listByOrg.mockResolvedValueOnce({
      data: [{ id: 'v1' }],
      meta: { total: 1 },
    });
    const result = await loadOrgVehiclesForProductGrants('org-2');
    expect(result.complete).toBe(true);
    expect(result.vehicles).toHaveLength(1);
  });

  it('continues to page 2 when meta.total is missing and first page is full', async () => {
    listByOrg.mockResolvedValueOnce({
      data: Array.from({ length: VEHICLE_LIST_PAGE_SIZE }, (_, i) => ({ id: `p1-${i}` })),
    });
    listByOrg.mockResolvedValueOnce({
      data: [{ id: 'p2-0' }],
    });
    const result = await loadOrgVehiclesForProductGrants('org-3');
    expect(listByOrg).toHaveBeenCalledTimes(2);
    expect(result.vehicles).toHaveLength(VEHICLE_LIST_PAGE_SIZE + 1);
    expect(result.complete).toBe(true);
    expect(result.reportedTotal).toBeNull();
  });
});