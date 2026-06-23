import type { ApiTask } from '../../lib/api';
import { isActiveTask } from '../components/service-center/service-center.utils';
import { deriveTaskIsOverdue } from './task-display.utils';
import { isServiceMaintenanceTask } from './service-task-semantics';
import { sortByActionPriority } from '../components/service-center/service-center.utils';

export function isOpenVehicleMaintenanceTask(task: ApiTask): boolean {
  return isActiveTask(task) && isServiceMaintenanceTask(task);
}

export function selectOpenVehicleMaintenanceTasks(tasks: ApiTask[], limit = 4): ApiTask[] {
  return sortByActionPriority(tasks.filter(isOpenVehicleMaintenanceTask)).slice(0, limit);
}

export function summarizeVehicleMaintenanceTasks(tasks: ApiTask[]): {
  openCount: number;
  overdueCount: number;
  criticalCount: number;
  blockingCount: number;
} {
  const open = tasks.filter(isOpenVehicleMaintenanceTask);
  return {
    openCount: open.length,
    overdueCount: open.filter((t) => deriveTaskIsOverdue(t)).length,
    criticalCount: open.filter((t) => t.priority === 'CRITICAL').length,
    blockingCount: open.filter((t) => t.blocksVehicleAvailability).length,
  };
}
