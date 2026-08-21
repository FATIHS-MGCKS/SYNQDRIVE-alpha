import type { ApiTask, ApiTaskType } from '../../lib/api';
import { vehicleFormattingLocaleOrDefault } from '../components/vehicle/vehicle-i18n';
import { deriveTaskSourceBadge, taskSourceBadgeLabel } from './task-operator.utils';

/** Service-/Maintenance-fokussierte Task-Typen für Operator-UI. */
export const SERVICE_MAINTENANCE_TYPES: ApiTaskType[] = [
  'VEHICLE_SERVICE',
  'REPAIR',
  'VEHICLE_INSPECTION',
  'TIRE_CHECK',
  'BRAKE_CHECK',
  'BATTERY_CHECK',
  'VEHICLE_CLEANING',
  'CUSTOM',
];

const NON_MAINTENANCE_TYPES = new Set<ApiTaskType>([
  'BOOKING_PREPARATION',
  'BOOKING_PICKUP',
  'BOOKING_RETURN',
  'DOCUMENT_REVIEW',
  'INVOICE_REQUIRED',
  'CUSTOMER_FOLLOWUP',
]);

/** True for service / maintenance / repair task types (any status). */
export function isServiceMaintenanceTask(task: Pick<ApiTask, 'type' | 'category'>): boolean {
  if (NON_MAINTENANCE_TYPES.has(task.type)) return false;
  if (SERVICE_MAINTENANCE_TYPES.includes(task.type)) return true;
  const cat = (task.category ?? '').toLowerCase();
  return (
    cat.includes('wartung') ||
    cat.includes('service') ||
    cat.includes('repar') ||
    cat.includes('tüv') ||
    cat.includes('tuv') ||
    cat.includes('reifen') ||
    cat.includes('bremse') ||
    cat.includes('batterie') ||
    cat.includes('inspektion')
  );
}

export type ServiceBoardColumn =
  | 'open'
  | 'scheduled'
  | 'in-progress'
  | 'waiting-vendor'
  | 'done';

export const SERVICE_BOARD_COLUMN_IDS: ServiceBoardColumn[] = [
  'open',
  'scheduled',
  'in-progress',
  'waiting-vendor',
  'done',
];

export function boardColumnForTask(task: ApiTask): ServiceBoardColumn {
  if (task.status === 'DONE' || task.status === 'CANCELLED') return 'done';
  if (task.status === 'IN_PROGRESS') return 'in-progress';
  if (task.status === 'WAITING') return 'waiting-vendor';
  if (task.status === 'OPEN' && task.dueDate) {
    const due = new Date(task.dueDate).getTime();
    if (!Number.isNaN(due) && due >= Date.now()) return 'scheduled';
  }
  return 'open';
}

export function taskSourceLabel(task: ApiTask): string {
  return taskSourceBadgeLabel(deriveTaskSourceBadge(task));
}

export function checklistProgress(task: ApiTask): { done: number; total: number } | null {
  const items = task.checklist;
  if (!items?.length) return null;
  const done = items.filter((i) => i.isDone).length;
  return { done, total: items.length };
}

export function formatCostCents(cents: number | null | undefined): string | null {
  if (cents == null || !Number.isFinite(cents)) return null;
  return new Intl.NumberFormat(vehicleFormattingLocaleOrDefault(), { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

/** Preferred vendors for a vehicle from vendor master links. */
export function preferredVendorsForVehicle(
  vendors: Array<{ id: string; name: string; linkedVehicles?: Array<{ id: string; isPreferred: boolean }> }>,
  vehicleId: string | null | undefined,
): Array<{ id: string; name: string }> {
  if (!vehicleId) return [];
  return vendors
    .filter((v) =>
      v.linkedVehicles?.some((lv) => lv.id === vehicleId && lv.isPreferred),
    )
    .map((v) => ({ id: v.id, name: v.name }));
}
