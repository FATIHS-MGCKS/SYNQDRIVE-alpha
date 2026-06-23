import type { ApiTask, ApiTaskType } from '../../lib/api';
import { SERVICE_MAINTENANCE_TYPES } from './service-task-semantics';

const MS_DAY = 24 * 60 * 60 * 1000;

const MAINTENANCE_HISTORY_TYPES = new Set<ApiTaskType>([
  ...SERVICE_MAINTENANCE_TYPES,
  'VEHICLE_INSPECTION',
  'REPAIR',
]);

const EXCLUDED_HISTORY_TYPES = new Set<ApiTaskType>([
  'BOOKING_PREPARATION',
  'BOOKING_PICKUP',
  'BOOKING_RETURN',
  'DOCUMENT_REVIEW',
  'INVOICE_REQUIRED',
  'CUSTOMER_FOLLOWUP',
]);

export interface ServiceHistoryFilters {
  vehicleId: string | 'ALL';
  vendorId: string | 'ALL';
  type: ApiTaskType | 'ALL';
  dateFrom: string;
  dateTo: string;
  includeCancelled: boolean;
}

export const DEFAULT_SERVICE_HISTORY_FILTERS: ServiceHistoryFilters = {
  vehicleId: 'ALL',
  vendorId: 'ALL',
  type: 'ALL',
  dateFrom: '',
  dateTo: '',
  includeCancelled: false,
};

export function isMaintenanceHistoryTask(task: ApiTask): boolean {
  if (task.status !== 'DONE' && task.status !== 'CANCELLED') return false;
  if (EXCLUDED_HISTORY_TYPES.has(task.type)) return false;
  if (MAINTENANCE_HISTORY_TYPES.has(task.type)) return true;
  const cat = (task.category ?? '').toLowerCase();
  return (
    cat.includes('wartung') ||
    cat.includes('service') ||
    cat.includes('repar') ||
    cat.includes('tüv') ||
    cat.includes('tuv') ||
    cat.includes('reifen') ||
    cat.includes('bremse') ||
    cat.includes('batterie')
  );
}

export function taskCompletedTimestamp(task: ApiTask): number {
  const raw = task.completedAt ?? task.updatedAt ?? task.createdAt;
  const d = new Date(raw ?? 0).getTime();
  return Number.isFinite(d) ? d : 0;
}

export function completedDateKey(task: ApiTask): string {
  const ts = taskCompletedTimestamp(task);
  if (!ts) return 'Unbekanntes Datum';
  return new Date(ts).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function applyServiceHistoryFilters(
  tasks: ApiTask[],
  filters: ServiceHistoryFilters,
): ApiTask[] {
  return tasks
    .filter(isMaintenanceHistoryTask)
    .filter((t) => filters.includeCancelled || t.status === 'DONE')
    .filter((t) => filters.vehicleId === 'ALL' || t.vehicleId === filters.vehicleId)
    .filter((t) => filters.vendorId === 'ALL' || t.vendorId === filters.vendorId)
    .filter((t) => filters.type === 'ALL' || t.type === filters.type)
    .filter((t) => {
      if (!filters.dateFrom && !filters.dateTo) return true;
      const ts = taskCompletedTimestamp(t);
      if (!ts) return false;
      if (filters.dateFrom) {
        const from = new Date(filters.dateFrom).getTime();
        if (ts < from) return false;
      }
      if (filters.dateTo) {
        const to = new Date(filters.dateTo).getTime() + MS_DAY;
        if (ts >= to) return false;
      }
      return true;
    })
    .sort((a, b) => taskCompletedTimestamp(b) - taskCompletedTimestamp(a));
}

export function groupHistoryByDate(tasks: ApiTask[]): Map<string, ApiTask[]> {
  const map = new Map<string, ApiTask[]>();
  for (const task of tasks) {
    const key = completedDateKey(task);
    const list = map.get(key) ?? [];
    list.push(task);
    map.set(key, list);
  }
  return map;
}

export function attachmentCount(task: ApiTask): number {
  return task.attachments?.length ?? 0;
}
