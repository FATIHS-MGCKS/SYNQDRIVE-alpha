import { api } from '../../lib/api';
import type { DashboardUtilizationOverview } from './dashboard-utilization.types';

export async function fetchDashboardUtilizationOverview(
  organizationId: string,
  params: { year: number; month: number; stationId?: string | null },
): Promise<DashboardUtilizationOverview | null> {
  try {
    return await api.dashboardUtilization.getOverview(organizationId, params);
  } catch {
    return null;
  }
}
