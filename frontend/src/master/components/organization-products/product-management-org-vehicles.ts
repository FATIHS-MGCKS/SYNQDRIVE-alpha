import { api } from '../../../lib/api';
import type { OrgVehicleListRow } from '../../organizations/product-management.types';

export const VEHICLE_LIST_PAGE_SIZE = 100;
export const VEHICLE_LIST_MAX_PAGES = 50;

export type OrgVehicleLoadResult = {
  vehicles: OrgVehicleListRow[];
  complete: boolean;
  loadedCount: number;
  reportedTotal: number | null;
  stoppedReason?: 'end_of_data' | 'page_cap';
};

export async function loadOrgVehiclesForProductGrants(orgId: string): Promise<OrgVehicleLoadResult> {
  const all: OrgVehicleListRow[] = [];
  let reportedTotal: number | null = null;

  for (let page = 1; page <= VEHICLE_LIST_MAX_PAGES; page += 1) {
    const res = await api.vehicles.listByOrg(orgId, { page, limit: VEHICLE_LIST_PAGE_SIZE });
    const chunk = (res.data ?? []) as OrgVehicleListRow[];

    if (res.meta?.total != null) {
      reportedTotal = res.meta.total;
    }

    if (chunk.length === 0) {
      return {
        vehicles: all,
        complete: true,
        loadedCount: all.length,
        reportedTotal,
        stoppedReason: 'end_of_data',
      };
    }

    all.push(...chunk);

    if (chunk.length < VEHICLE_LIST_PAGE_SIZE) {
      return {
        vehicles: all,
        complete: true,
        loadedCount: all.length,
        reportedTotal,
        stoppedReason: 'end_of_data',
      };
    }

    if (reportedTotal != null && all.length >= reportedTotal) {
      return {
        vehicles: all,
        complete: true,
        loadedCount: all.length,
        reportedTotal,
        stoppedReason: 'end_of_data',
      };
    }
  }

  const complete = reportedTotal != null && all.length >= reportedTotal;

  return {
    vehicles: all,
    complete,
    loadedCount: all.length,
    reportedTotal,
    stoppedReason: complete ? 'end_of_data' : 'page_cap',
  };
}