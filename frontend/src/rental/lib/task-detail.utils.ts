import type { ApiTaskStatus, ApiTaskType } from '../../lib/api';
import { apiTaskStatusLabelDe } from '../../lib/tasks/task-labels';
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

export function formatTaskDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTaskDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function toDateInputValue(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}
