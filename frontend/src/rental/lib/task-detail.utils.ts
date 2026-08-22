import type { ApiTaskStatus, ApiTaskType } from '../../lib/api';
import type { SupportedLocale } from '../../i18n/locales';
import { apiTaskStatusLabelDe } from '../../lib/tasks/task-labels';
import {
  formatTaskDetailDate,
  formatTaskDetailDateTime,
} from '../../lib/tasks/task-detail-presentation-i18n';
import type { StatusTone } from '../../components/patterns';

/** Mirrors backend `RESOLUTION_REQUIRED_TYPES` in tasks.service.ts */
export const RESOLUTION_REQUIRED_TASK_TYPES: ApiTaskType[] = [
  'REPAIR',
  'BRAKE_CHECK',
  'TIRE_CHECK',
  'BATTERY_CHECK',
  'VEHICLE_SERVICE',
  'VEHICLE_INSPECTION',
];

export function taskRequiresResolutionNote(type: ApiTaskType): boolean {
  return RESOLUTION_REQUIRED_TASK_TYPES.includes(type);
}

export function isTerminalTaskStatus(status: ApiTaskStatus): boolean {
  return status === 'DONE' || status === 'CANCELLED';
}

export function isActiveTaskStatus(status: ApiTaskStatus): boolean {
  return !isTerminalTaskStatus(status);
}

export function taskStatusLabelDe(status: ApiTaskStatus): string {
  return apiTaskStatusLabelDe(status);
}

export function taskStatusTone(status: ApiTaskStatus, isOverdue?: boolean): StatusTone {
  if (status === 'DONE') return 'success';
  if (status === 'CANCELLED') return 'neutral';
  if (isOverdue) return 'critical';
  if (status === 'IN_PROGRESS') return 'warning';
  if (status === 'WAITING') return 'neutral';
  return 'info';
}

/** @deprecated Prefer formatTaskDetailDateTime(locale, iso) for locale-aware presentation. */
export function formatTaskDateTime(
  iso?: string | null,
  locale: SupportedLocale = 'de',
): string {
  return formatTaskDetailDateTime(locale, iso);
}

/** @deprecated Prefer formatTaskDetailDate(locale, iso) for locale-aware presentation. */
export function formatTaskDate(iso?: string | null, locale: SupportedLocale = 'de'): string {
  return formatTaskDetailDate(locale, iso);
}

export function toDateInputValue(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}
