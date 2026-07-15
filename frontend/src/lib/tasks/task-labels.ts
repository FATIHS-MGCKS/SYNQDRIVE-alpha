import type { ApiTaskPriority, ApiTaskStatus } from '../api';

/** Canonical German labels for `ApiTaskStatus` across Operator and Rental surfaces. */
export const API_TASK_STATUS_LABEL_DE: Record<ApiTaskStatus, string> = {
  OPEN: 'Offen',
  IN_PROGRESS: 'In Bearbeitung',
  WAITING: 'Wartend',
  DONE: 'Erledigt',
  CANCELLED: 'Storniert',
};

/** Canonical German labels for `ApiTaskPriority`. */
export const API_TASK_PRIORITY_LABEL_DE: Record<ApiTaskPriority, string> = {
  CRITICAL: 'Kritisch',
  HIGH: 'Hoch',
  NORMAL: 'Normal',
  LOW: 'Niedrig',
};

export function apiTaskStatusLabelDe(status: ApiTaskStatus): string {
  return API_TASK_STATUS_LABEL_DE[status] ?? status;
}

export function apiTaskPriorityLabelDe(priority: ApiTaskPriority): string {
  return API_TASK_PRIORITY_LABEL_DE[priority] ?? priority;
}
