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
  let page = 1;
  const all: OrgVehicleListRow[] = [];
  let reportedTotal: number | null = null;
  let hitPageCap = false;

  while (page <= VEHICLE_LIST_MAX_PAGES) {
    const res = await api.vehicles.listByOrg(orgId, { page, limit: VEHICLE_LIST_PAGE_SIZE });
    const chunk = (res.data ?? []) as OrgVehicleListRow[];
    all.push(...chunk);
    reportedTotal = res.meta?.total ?? reportedTotal;
    const total = reportedTotal ?? all.length;
    if (chunk.length < VEHICLE_LIST_PAGE_SIZE || all.length >= total) {
      return {
        vehicles: all,
        complete: true,
        loadedCount: all.length,
        reportedTotal,
        stoppedReason: 'end_of_data',
      };
    }
    page += 1;
  }

  hitPageCap = true;
  const complete =
    reportedTotal != null ? all.length >= reportedTotal : false;

  return {
    vehicles: all,
    complete: !hitPageCap && complete,
    loadedCount: all.length,
    reportedTotal,
    stoppedReason: hitPageCap && !complete ? 'page_cap' : 'end_of_data',
  };
}