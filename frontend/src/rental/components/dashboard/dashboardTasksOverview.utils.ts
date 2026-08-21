import type { ApiTask } from '../../../lib/api';
import type { ApiTaskPriority, TaskBucket } from '../../../lib/tasks/types';
import { deriveTaskIsOverdue } from '../../lib/task-display.utils';
import { isActiveApiTask } from '../../lib/taskBulkActions.utils';
import { bucketCountFromSummary } from '../../lib/tasks-page.utils';
import type { ApiTaskSummary } from '../../../lib/tasks/types';
import type { VehicleData } from '../../data/vehicles';
import { vehicleMatchesStationFilter } from '../../lib/fleet-station-filter';

export const DASHBOARD_TASKS_PREVIEW_LIMIT = 5;

export interface DashboardTasksOverviewCounts {
  open: number;
  overdue: number;
  today: number;
  inProgress: number;
  unassigned: number;
}

export function extractTaskMetadataStationId(task: Pick<ApiTask, 'metadata'>): string | null {
  const meta = task.metadata;
  if (!meta || typeof meta !== 'object') return null;
  const stationId = (meta as Record<string, unknown>).stationId;
  return typeof stationId === 'string' && stationId.trim() ? stationId.trim() : null;
}

export function buildFleetVehicleById(
  vehicles: VehicleData[],
): Map<string, VehicleData> {
  return new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
}

/**
 * Station scope for dashboard tasks — mirrors Service Center / fleet station semantics.
 * Vehicle-linked tasks match via vehicleMatchesStationFilter; non-vehicle tasks only
 * when metadata.stationId matches explicitly.
 */
export function taskMatchesDashboardStation(
  task: ApiTask,
  selectedStationId: string,
  vehicleById: Map<string, VehicleData>,
): boolean {
  if (task.vehicleId) {
    const vehicle = vehicleById.get(task.vehicleId);
    if (vehicle) {
      return vehicleMatchesStationFilter(vehicle, selectedStationId);
    }
    return false;
  }

  const metadataStationId = extractTaskMetadataStationId(task);
  if (metadataStationId) {
    return metadataStationId === selectedStationId;
  }

  return false;
}

export function filterTasksForDashboardStation(
  tasks: ApiTask[],
  selectedStationId: string,
  vehicleById: Map<string, VehicleData>,
): ApiTask[] {
  return tasks.filter(
    (task) =>
      isActiveApiTask(task) &&
      taskMatchesDashboardStation(task, selectedStationId, vehicleById),
  );
}

export function isTaskDueToday(task: Pick<ApiTask, 'bucket' | 'dueDate' | 'status'>): boolean {
  if (task.bucket === 'TODAY') return true;
  if (!task.dueDate) return false;
  const due = new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  const now = new Date();
  return (
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate()
  );
}

export function isTaskNowRequired(task: Pick<ApiTask, 'bucket'>): boolean {
  return task.bucket === 'NOW';
}

const PRIORITY_ORDER: Record<ApiTaskPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
};

export function compareDashboardTaskPreviewPriority(a: ApiTask, b: ApiTask): number {
  const aOverdue = deriveTaskIsOverdue(a) ? 0 : 1;
  const bOverdue = deriveTaskIsOverdue(b) ? 0 : 1;
  if (aOverdue !== bOverdue) return aOverdue - bOverdue;

  const aNow = isTaskNowRequired(a) ? 0 : 1;
  const bNow = isTaskNowRequired(b) ? 0 : 1;
  if (aNow !== bNow) return aNow - bNow;

  const aToday = isTaskDueToday(a) ? 0 : 1;
  const bToday = isTaskDueToday(b) ? 0 : 1;
  if (aToday !== bToday) return aToday - bToday;

  const aPriority = PRIORITY_ORDER[a.priority] ?? PRIORITY_ORDER.NORMAL;
  const bPriority = PRIORITY_ORDER[b.priority] ?? PRIORITY_ORDER.NORMAL;
  if (aPriority !== bPriority) return aPriority - bPriority;

  const aInProgress = a.status === 'IN_PROGRESS' ? 0 : 1;
  const bInProgress = b.status === 'IN_PROGRESS' ? 0 : 1;
  if (aInProgress !== bInProgress) return aInProgress - bInProgress;

  const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
  const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
  return aDue - bDue;
}

export function sortDashboardTaskPreview(tasks: ApiTask[]): ApiTask[] {
  return [...tasks].filter(isActiveApiTask).sort(compareDashboardTaskPreviewPriority);
}

export function buildDashboardTaskPreview(tasks: ApiTask[]): ApiTask[] {
  return sortDashboardTaskPreview(tasks).slice(0, DASHBOARD_TASKS_PREVIEW_LIMIT);
}

export function deriveDashboardTasksOverviewCounts(tasks: ApiTask[]): DashboardTasksOverviewCounts {
  const active = tasks.filter(isActiveApiTask);
  return {
    open: active.length,
    overdue: active.filter((task) => deriveTaskIsOverdue(task)).length,
    today: active.filter((task) => isTaskDueToday(task)).length,
    inProgress: active.filter((task) => task.status === 'IN_PROGRESS').length,
    unassigned: active.filter((task) => !task.assignedUserId).length,
  };
}

export function buildDashboardTasksOverviewCountsFromSummary(
  summary: ApiTaskSummary | null | undefined,
  canViewUnassigned: boolean,
): DashboardTasksOverviewCounts | null {
  if (!summary) return null;
  return {
    open: summary.active ?? summary.open ?? 0,
    overdue: bucketCountFromSummary(summary, 'OVERDUE' satisfies TaskBucket, summary.overdue ?? 0),
    today: bucketCountFromSummary(summary, 'TODAY' satisfies TaskBucket, summary.dueToday ?? 0),
    inProgress: summary.inProgress ?? 0,
    unassigned: canViewUnassigned
      ? bucketCountFromSummary(summary, 'UNASSIGNED' satisfies TaskBucket, 0)
      : 0,
  };
}
