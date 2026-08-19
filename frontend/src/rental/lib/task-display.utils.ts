import { DEFAULT_PRODUCT_LOCALE } from '../../i18n/locales';
import type { ApiTask, ApiTaskPriority, ApiTaskStatus } from '../../lib/api';
import {
  vehicleTaskPriorityLabelI18n,
  vehicleTaskStatusLabelI18n,
  tt,
  tasksFormattingLocaleOrDefault,
} from '../components/tasks-settings/tasks-i18n';

/** Display buckets for the vehicle task list — aligned with backend `ApiTaskStatus`. */
export type VehicleTaskDisplayStatus =
  | 'open'
  | 'in-progress'
  | 'waiting'
  | 'done'
  | 'cancelled';

export type VehicleTaskFilter =
  | 'all'
  | VehicleTaskDisplayStatus
  | 'overdue'
  | 'blocking';

export type VehicleTaskPriority = 'low' | 'normal' | 'high' | 'critical';

export interface VehicleTaskRow {
  id: string;
  title: string;
  description: string;
  apiStatus: ApiTaskStatus;
  displayStatus: VehicleTaskDisplayStatus;
  isOverdue: boolean;
  priority: VehicleTaskPriority;
  category: string;
  assigneeLabel: string;
  dueDate: string | null;
  createdAt: string | null;
}

const TERMINAL_STATUSES: ReadonlySet<ApiTaskStatus> = new Set(['DONE', 'CANCELLED']);

export function deriveTaskIsOverdue(
  task: Pick<ApiTask, 'isOverdue' | 'status' | 'dueDate'>,
): boolean {
  if (TERMINAL_STATUSES.has(task.status)) return false;
  if (typeof task.isOverdue === 'boolean') return task.isOverdue;
  if (!task.dueDate) return false;
  const due = new Date(task.dueDate);
  return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
}

export function mapApiTaskToDisplayStatus(status: ApiTaskStatus): VehicleTaskDisplayStatus {
  switch (status) {
    case 'IN_PROGRESS':
      return 'in-progress';
    case 'WAITING':
      return 'waiting';
    case 'DONE':
      return 'done';
    case 'CANCELLED':
      return 'cancelled';
    case 'OPEN':
    default:
      return 'open';
  }
}

export function mapApiPriority(priority?: ApiTaskPriority | null): VehicleTaskPriority {
  switch ((priority ?? 'NORMAL').toUpperCase()) {
    case 'CRITICAL':
      return 'critical';
    case 'HIGH':
      return 'high';
    case 'LOW':
      return 'low';
    case 'NORMAL':
    default:
      return 'normal';
  }
}

export function mapApiTaskToVehicleRow(task: ApiTask, locale?: string | null): VehicleTaskRow | null {
  const productLocale = locale ?? DEFAULT_PRODUCT_LOCALE;
  if (!task?.id) return null;
  const apiStatus = task.status ?? 'OPEN';
  return {
    id: task.id,
    title: task.title?.trim() || tt(productLocale, 'tasks.display.noTitle'),
    description: task.description?.trim() || '',
    apiStatus,
    displayStatus: mapApiTaskToDisplayStatus(apiStatus),
    isOverdue: deriveTaskIsOverdue(task),
    priority: mapApiPriority(task.priority),
    category: task.category?.trim() || task.type || tt(productLocale, 'tasks.display.general'),
    assigneeLabel: task.assignedUserId?.trim() || tt(productLocale, 'tasks.display.unassigned'),
    dueDate: task.dueDate,
    createdAt: task.createdAt ?? null,
  };
}

export function parseVehicleTaskList(rows: unknown, locale?: string | null): VehicleTaskRow[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => mapApiTaskToVehicleRow(row as ApiTask, locale))
    .filter((t): t is VehicleTaskRow => t != null);
}

export function isActiveVehicleTask(task: VehicleTaskRow): boolean {
  return (
    task.displayStatus === 'open' ||
    task.displayStatus === 'in-progress' ||
    task.displayStatus === 'waiting'
  );
}

export function matchesVehicleTaskFilter(task: VehicleTaskRow, filter: VehicleTaskFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'overdue') return task.isOverdue && isActiveVehicleTask(task);
  return task.displayStatus === filter;
}

export function vehicleTaskSortRank(task: VehicleTaskRow): number {
  if (task.isOverdue && isActiveVehicleTask(task)) return 0;
  switch (task.displayStatus) {
    case 'open':
      return 1;
    case 'waiting':
      return 2;
    case 'in-progress':
      return 3;
    case 'done':
      return 4;
    case 'cancelled':
      return 5;
    default:
      return 6;
  }
}

export function formatTaskDueDate(iso: string | null, locale?: string | null): string {
  const productLocale = locale ?? DEFAULT_PRODUCT_LOCALE;
  if (!iso) return tt(productLocale, 'tasks.display.noDueDate');
  const formattingLocale = tasksFormattingLocaleOrDefault(productLocale);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return tt(productLocale, 'tasks.display.noDueDate');
  const formatted = d.toLocaleDateString(formattingLocale, {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
  return formatted;
}

/**
 * Due-date label for a maintenance/service task card.
 * - not overdue → "Fällig bis DD.MM.YY"
 * - overdue     → "Fällig seit DD.MM.YY"
 * Returns `null` when there is no usable due date (no row line rendered).
 */
export function formatVehicleMaintenanceDueLabel(
  task: Pick<ApiTask, 'dueDate' | 'isOverdue' | 'status'>,
  locale?: string | null,
): string | null {
  const productLocale = locale ?? DEFAULT_PRODUCT_LOCALE;
  if (!task.dueDate) return null;
  const formatted = formatTaskDueDate(task.dueDate, productLocale);
  const noDue = tt(productLocale, 'tasks.display.noDueDate');
  if (formatted === noDue) return null;
  return deriveTaskIsOverdue(task)
    ? tt(productLocale, 'tasks.display.dueSince', { date: formatted })
    : tt(productLocale, 'tasks.display.dueBy', { date: formatted });
}

export function vehicleTaskStatusLabel(
  status: VehicleTaskDisplayStatus,
  isOverdue: boolean,
  locale?: string | null,
): string {
  return vehicleTaskStatusLabelI18n(locale ?? DEFAULT_PRODUCT_LOCALE, status, isOverdue);
}

export function vehicleTaskPriorityLabel(priority: VehicleTaskPriority, locale?: string | null): string {
  return vehicleTaskPriorityLabelI18n(locale ?? DEFAULT_PRODUCT_LOCALE, priority);
}

export function vehicleTaskStatusTone(
  status: VehicleTaskDisplayStatus,
  isOverdue: boolean,
): 'info' | 'success' | 'warning' | 'critical' | 'neutral' {
  if (isOverdue && status !== 'done' && status !== 'cancelled') return 'critical';
  switch (status) {
    case 'in-progress':
      return 'warning';
    case 'waiting':
      return 'neutral';
    case 'done':
      return 'success';
    case 'cancelled':
      return 'neutral';
    case 'open':
    default:
      return 'info';
  }
}

export function vehicleTaskStatusIcon(
  status: VehicleTaskDisplayStatus,
  isOverdue: boolean,
): string {
  if (isOverdue && status !== 'done' && status !== 'cancelled') return 'alert-triangle';
  switch (status) {
    case 'in-progress':
      return 'clock';
    case 'waiting':
      return 'pause';
    case 'done':
      return 'check-circle-2';
    case 'cancelled':
      return 'ban';
    case 'open':
    default:
      return 'clipboard-list';
  }
}

export interface VehicleTaskCounts {
  total: number;
  open: number;
  inProgress: number;
  waiting: number;
  overdue: number;
  done: number;
  cancelled: number;
  active: number;
}

export function countVehicleTasks(tasks: VehicleTaskRow[]): VehicleTaskCounts {
  let open = 0;
  let inProgress = 0;
  let waiting = 0;
  let overdue = 0;
  let done = 0;
  let cancelled = 0;

  for (const task of tasks) {
    switch (task.displayStatus) {
      case 'open':
        open += 1;
        break;
      case 'in-progress':
        inProgress += 1;
        break;
      case 'waiting':
        waiting += 1;
        break;
      case 'done':
        done += 1;
        break;
      case 'cancelled':
        cancelled += 1;
        break;
      default:
        break;
    }
    if (task.isOverdue && isActiveVehicleTask(task)) overdue += 1;
  }

  return {
    total: tasks.length,
    open,
    inProgress,
    waiting,
    overdue,
    done,
    cancelled,
    active: open + inProgress + waiting,
  };
}
