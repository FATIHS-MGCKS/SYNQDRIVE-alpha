import type { ApiTask, ApiTaskSummary } from '../../../lib/api';
import { deriveTaskIsOverdue } from '../../lib/task-display.utils';
import type { ServiceKpiSnapshot, ServiceTaskFilter } from './service-center.types';

const ACTIVE_STATUSES = new Set(['OPEN', 'IN_PROGRESS', 'WAITING']);

const SERVICE_TASK_TYPES = new Set([
  'VEHICLE_SERVICE',
  'TIRE_CHECK',
  'BRAKE_CHECK',
  'BATTERY_CHECK',
  'VEHICLE_CLEANING',
]);

const MS_DAY = 24 * 60 * 60 * 1000;

export function isActiveTask(task: ApiTask): boolean {
  return ACTIVE_STATUSES.has(task.status);
}

export function isTuvRelatedTask(task: ApiTask): boolean {
  if (task.type === 'VEHICLE_INSPECTION') return true;
  const cat = (task.category ?? '').toLowerCase();
  return cat.includes('tüv') || cat.includes('tuv') || cat.includes('hu') || cat.includes('inspection');
}

export function isDueSoonTask(task: ApiTask, withinDays = 7): boolean {
  if (!isActiveTask(task) || !task.dueDate || deriveTaskIsOverdue(task)) return false;
  const due = new Date(task.dueDate).getTime();
  if (Number.isNaN(due)) return false;
  const now = Date.now();
  return due >= now && due <= now + withinDays * MS_DAY;
}

export function deriveServiceKpis(
  summary: ApiTaskSummary | null,
  activeTasks: ApiTask[],
  tasksLoaded: boolean,
): ServiceKpiSnapshot {
  if (!summary && !tasksLoaded) {
    return {
      overdue: null,
      dueSoon: null,
      inProgress: null,
      waitingVendor: null,
      urgent: null,
      tuvDue: null,
      openRepairs: null,
      openService: null,
      dataReady: false,
    };
  }

  const derivedFromList = tasksLoaded && activeTasks.length >= 0;

  return {
    overdue: summary?.overdue ?? (derivedFromList ? activeTasks.filter((t) => deriveTaskIsOverdue(t)).length : null),
    dueSoon: derivedFromList ? activeTasks.filter((t) => isDueSoonTask(t)).length : null,
    inProgress: summary?.inProgress ?? null,
    waitingVendor: derivedFromList
      ? activeTasks.filter((t) => t.status === 'WAITING' && Boolean(t.vendorId)).length
      : summary?.waiting ?? null,
    urgent: derivedFromList ? activeTasks.filter(isUrgentTask).length : null,
    tuvDue: derivedFromList ? activeTasks.filter(isTuvRelatedTask).length : null,
    openRepairs: derivedFromList ? activeTasks.filter((t) => t.type === 'REPAIR').length : null,
    openService: derivedFromList
      ? activeTasks.filter((t) => SERVICE_TASK_TYPES.has(t.type)).length
      : null,
    dataReady: Boolean(summary) || tasksLoaded,
  };
}

export function matchesServiceTaskFilter(task: ApiTask, filter: ServiceTaskFilter): boolean {
  if (filter === 'all') return isActiveTask(task);
  if (filter === 'overdue') return isActiveTask(task) && deriveTaskIsOverdue(task);
  if (filter === 'due-soon') return isDueSoonTask(task);
  if (filter === 'in-progress') return task.status === 'IN_PROGRESS';
  if (filter === 'waiting-vendor') return task.status === 'WAITING' && Boolean(task.vendorId);
  if (filter === 'urgent') return isUrgentTask(task);
  if (filter === 'tuv') return isActiveTask(task) && isTuvRelatedTask(task);
  if (filter === 'repairs') return isActiveTask(task) && task.type === 'REPAIR';
  if (filter === 'service') return isActiveTask(task) && SERVICE_TASK_TYPES.has(task.type);
  return true;
}

export function formatKpiValue(value: number | null): string {
  if (value == null) return '—';
  return String(value);
}

export function isUrgentTask(task: ApiTask): boolean {
  return isActiveTask(task) && (task.priority === 'CRITICAL' || task.blocksVehicleAvailability);
}

export function isVendorWaitingTask(task: ApiTask): boolean {
  return isActiveTask(task) && (task.status === 'WAITING' || Boolean(task.vendorId));
}

export function actionRequiredScore(task: ApiTask): number {
  let s = 0;
  if (task.blocksVehicleAvailability) s += 100;
  if (deriveTaskIsOverdue(task)) s += 80;
  if (task.priority === 'CRITICAL') s += 60;
  if (task.priority === 'HIGH') s += 30;
  if (task.status === 'WAITING') s += 15;
  if (isDueSoonTask(task)) s += 10;
  return s;
}

export function sortByActionPriority(tasks: ApiTask[]): ApiTask[] {
  return [...tasks].sort((a, b) => {
    const diff = actionRequiredScore(b) - actionRequiredScore(a);
    if (diff !== 0) return diff;
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    return ad - bd;
  });
}

export function selectActionRequiredTasks(tasks: ApiTask[], limit = 10): ApiTask[] {
  return sortByActionPriority(
    tasks.filter(
      (t) =>
        isActiveTask(t) &&
        (deriveTaskIsOverdue(t) ||
          t.priority === 'CRITICAL' ||
          t.blocksVehicleAvailability ||
          t.status === 'WAITING' ||
          isDueSoonTask(t)),
    ),
  ).slice(0, limit);
}

export function selectVendorWaitingTasks(tasks: ApiTask[], limit = 8): ApiTask[] {
  return sortByActionPriority(tasks.filter((t) => t.status === 'WAITING' && Boolean(t.vendorId))).slice(
    0,
    limit,
  );
}

export function selectUpcomingTasks(tasks: ApiTask[], limit = 12): ApiTask[] {
  const now = Date.now();
  return [...tasks]
    .filter((t) => isActiveTask(t) && t.dueDate)
    .filter((t) => {
      const due = new Date(t.dueDate!).getTime();
      return !Number.isNaN(due) && due >= now - MS_DAY;
    })
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, limit);
}

export function selectRecentlyCompleted(tasks: ApiTask[], limit = 6): ApiTask[] {
  return [...tasks]
    .filter((t) => t.status === 'DONE')
    .sort((a, b) => {
      const ad = new Date(a.completedAt ?? a.updatedAt ?? 0).getTime();
      const bd = new Date(b.completedAt ?? b.updatedAt ?? 0).getTime();
      return bd - ad;
    })
    .slice(0, limit);
}

export function groupTasksByDueDate(tasks: ApiTask[]): Map<string, ApiTask[]> {
  const map = new Map<string, ApiTask[]>();
  for (const task of tasks) {
    const key = task.dueDate
      ? new Date(task.dueDate).toLocaleDateString('de-DE', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        })
      : 'Ohne Termin';
    const list = map.get(key) ?? [];
    list.push(task);
    map.set(key, list);
  }
  return map;
}
export function groupTasksByDueWeek(tasks: ApiTask[]): Map<string, ApiTask[]> {
  const map = new Map<string, ApiTask[]>();
  const sorted = [...tasks].sort((a, b) => {
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    return ad - bd;
  });

  for (const task of sorted) {
    const key = task.dueDate
      ? new Date(task.dueDate).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
      : 'Ohne Termin';
    const list = map.get(key) ?? [];
    list.push(task);
    map.set(key, list);
  }
  return map;
}
