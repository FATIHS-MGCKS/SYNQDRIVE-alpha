import type { ApiTaskStatus, ApiTaskType } from '../../lib/api';
import type { ServiceCenterTab, ServiceTaskFilter } from '../components/service-center/service-center.types';
import type { ServiceTaskAdvancedFilters } from './service-task-filters';

/** Deep-link / cross-view navigation into Fleet → Service Center. */
export interface ServiceCenterNavState {
  tab?: ServiceCenterTab;
  vehicleId?: string;
  vendorId?: string;
  taskStatus?: ApiTaskStatus | ServiceTaskAdvancedFilters['status'];
  taskType?: ApiTaskType;
  taskFilter?: ServiceTaskFilter;
  focusTaskId?: string;
}

export function serviceCenterNavToAdvancedFilters(
  nav: Pick<ServiceCenterNavState, 'vehicleId' | 'vendorId' | 'taskStatus' | 'taskType' | 'taskFilter'>,
): Partial<ServiceTaskAdvancedFilters> {
  const patch: Partial<ServiceTaskAdvancedFilters> = {};
  if (nav.vehicleId) patch.vehicleId = nav.vehicleId;
  if (nav.vendorId) patch.vendorId = nav.vendorId;
  if (nav.taskType) patch.type = nav.taskType;
  if (nav.taskStatus) patch.status = nav.taskStatus;
  if (nav.taskFilter) patch.kpiFilter = nav.taskFilter;
  return patch;
}

export function hasServiceCenterContextFilters(
  nav: Partial<ServiceCenterNavState> | null | undefined,
): boolean {
  if (!nav) return false;
  return Boolean(nav.vehicleId || nav.vendorId || nav.taskType || nav.taskStatus || nav.taskFilter);
}
