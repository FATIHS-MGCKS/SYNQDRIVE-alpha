import type { ApiTask, ApiTaskPriority, ApiTaskStatus, ApiTaskType } from '../../lib/api';
import { deriveTaskIsOverdue } from '../lib/task-display.utils';
import { isDueSoonTask, isUrgentTask, matchesServiceTaskFilter } from '../components/service-center/service-center.utils';
import type { ServiceTaskFilter } from '../components/service-center/service-center.types';

export type ServiceTaskViewMode = 'list' | 'board' | 'calendar';

export interface ServiceTaskAdvancedFilters {
  status: ApiTaskStatus | 'ALL' | 'ACTIVE';
  priority: ApiTaskPriority | 'ALL';
  type: ApiTaskType | 'ALL';
  vehicleId: string | 'ALL';
  vendorId: string | 'ALL';
  assignedUserId: string | 'ALL';
  stationId: string | 'ALL';
  overdueOnly: boolean;
  dueSoonOnly: boolean;
  urgentOnly: boolean;
  search: string;
  /** KPI chip from control bar */
  kpiFilter: ServiceTaskFilter;
}

export const DEFAULT_SERVICE_TASK_FILTERS: ServiceTaskAdvancedFilters = {
  status: 'ACTIVE',
  priority: 'ALL',
  type: 'ALL',
  vehicleId: 'ALL',
  vendorId: 'ALL',
  assignedUserId: 'ALL',
  stationId: 'ALL',
  overdueOnly: false,
  dueSoonOnly: false,
  urgentOnly: false,
  search: '',
  kpiFilter: 'all',
};

export function applyServiceTaskFilters(
  tasks: ApiTask[],
  filters: ServiceTaskAdvancedFilters,
  vehicleStationById: Map<string, string | null | undefined>,
): ApiTask[] {
  const q = filters.search.trim().toLowerCase();

  return tasks
    .filter((t) => {
      if (filters.status === 'ACTIVE') {
        return t.status === 'OPEN' || t.status === 'IN_PROGRESS' || t.status === 'WAITING';
      }
      if (filters.status !== 'ALL' && t.status !== filters.status) return false;
      return true;
    })
    .filter((t) => filters.priority === 'ALL' || t.priority === filters.priority)
    .filter((t) => filters.type === 'ALL' || t.type === filters.type)
    .filter((t) => filters.vehicleId === 'ALL' || t.vehicleId === filters.vehicleId)
    .filter((t) => filters.vendorId === 'ALL' || t.vendorId === filters.vendorId)
    .filter((t) => filters.assignedUserId === 'ALL' || t.assignedUserId === filters.assignedUserId)
    .filter((t) => {
      if (filters.stationId === 'ALL' || !t.vehicleId) return filters.stationId === 'ALL';
      return vehicleStationById.get(t.vehicleId) === filters.stationId;
    })
    .filter((t) => !filters.overdueOnly || deriveTaskIsOverdue(t))
    .filter((t) => !filters.dueSoonOnly || isDueSoonTask(t))
    .filter((t) => !filters.urgentOnly || isUrgentTask(t))
    .filter((t) => matchesServiceTaskFilter(t, filters.kpiFilter))
    .filter((t) => {
      if (!q) return true;
      return [t.title, t.description, t.category, t.type, t.id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    })
    .sort((a, b) => {
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      return ad - bd;
    });
}
