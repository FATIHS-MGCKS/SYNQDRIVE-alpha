import type { ApiTask, ApiTaskPriority, TaskListFilters } from '../../lib/api';
import { getStoredUser } from '../../lib/auth';

export type OperatorTaskScope = 'mine' | 'all';

export interface OperatorTaskViewFilters {
  scope: OperatorTaskScope;
  today: boolean;
  overdue: boolean;
  vehicleId: string | null;
  bookingId: string | null;
  priority: ApiTaskPriority | 'all';
}

export const DEFAULT_OPERATOR_TASK_FILTERS: OperatorTaskViewFilters = {
  scope: 'all',
  today: false,
  overdue: false,
  vehicleId: null,
  bookingId: null,
  priority: 'all',
};

export function getOperatorUserId(): string | null {
  return getStoredUser()?.id ?? null;
}

export function isDueToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function sortOperatorTasks(tasks: ApiTask[]): ApiTask[] {
  return [...tasks].sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    const prio = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
    const pd = (prio[a.priority] ?? 9) - (prio[b.priority] ?? 9);
    if (pd !== 0) return pd;
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return ad - bd;
  });
}

export function filterOperatorTasks(
  tasks: ApiTask[],
  filters: OperatorTaskViewFilters,
  userId: string | null,
): ApiTask[] {
  let rows = tasks;
  if (filters.scope === 'mine' && userId) {
    rows = rows.filter((t) => t.assignedUserId === userId);
  }
  if (filters.today) {
    rows = rows.filter((t) => isDueToday(t.dueDate));
  }
  if (filters.overdue) {
    rows = rows.filter((t) => t.isOverdue);
  }
  if (filters.vehicleId) {
    rows = rows.filter((t) => t.vehicleId === filters.vehicleId);
  }
  if (filters.bookingId) {
    rows = rows.filter((t) => t.bookingId === filters.bookingId);
  }
  if (filters.priority !== 'all') {
    rows = rows.filter((t) => t.priority === filters.priority);
  }
  return sortOperatorTasks(rows);
}

export function buildTaskListApiFilters(
  filters: OperatorTaskViewFilters,
  userId: string | null,
): TaskListFilters | undefined {
  const api: TaskListFilters = {};
  let has = false;
  if (filters.scope === 'mine' && userId) {
    api.assignedUserId = userId;
    has = true;
  }
  if (filters.overdue) {
    api.overdue = true;
    has = true;
  }
  if (filters.vehicleId) {
    api.vehicleId = filters.vehicleId;
    has = true;
  }
  if (filters.bookingId) {
    api.bookingId = filters.bookingId;
    has = true;
  }
  if (filters.priority !== 'all') {
    api.priority = filters.priority;
    has = true;
  }
  if (filters.today) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    api.dueFrom = start.toISOString();
    api.dueTo = end.toISOString();
    has = true;
  }
  return has ? api : undefined;
}

export function dispatchOperatorTaskUpdated(vehicleId?: string | null): void {
  window.dispatchEvent(
    new CustomEvent('operator:task-updated', { detail: { vehicleId: vehicleId ?? null } }),
  );
}

export function formatOperatorTaskDue(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
