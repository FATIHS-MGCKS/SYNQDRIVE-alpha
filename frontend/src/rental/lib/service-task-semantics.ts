import type { ApiTask, ApiTaskPriority, ApiTaskSource, ApiTaskStatus, ApiTaskType } from '../../lib/api';
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

export const TASK_TYPE_LABEL_DE: Record<ApiTaskType, string> = {
  VEHICLE_SERVICE: 'Fahrzeug-Service / Wartung',
  REPAIR: 'Reparatur',
  VEHICLE_INSPECTION: 'TÜV/HU & Inspektion',
  TIRE_CHECK: 'Reifen prüfen / wechseln',
  BRAKE_CHECK: 'Bremsen prüfen',
  BATTERY_CHECK: 'Batterie prüfen',
  VEHICLE_CLEANING: 'Reinigung / Aufbereitung',
  BOOKING_PREPARATION: 'Buchungsvorbereitung',
  BOOKING_PICKUP: 'Fahrzeugübergabe',
  BOOKING_RETURN: 'Fahrzeugrückgabe',
  DOCUMENT_REVIEW: 'Dokumentenprüfung',
  INVOICE_REQUIRED: 'Rechnung erforderlich',
  CUSTOMER_FOLLOWUP: 'Kunden-Nachverfolgung',
  CUSTOM: 'Allgemeine Instandhaltung',
};

export function taskTypeLabel(task: Pick<ApiTask, 'type' | 'metadata' | 'category'>): string {
  const meta = task.metadata && typeof task.metadata === 'object' ? task.metadata : null;
  if (task.type === 'REPAIR' && meta && ('damageId' in meta || meta.origin === 'DAMAGE')) {
    return 'Schadenreparatur';
  }
  if (task.category?.trim()) {
    const cat = task.category.trim();
    if (cat.toLowerCase().includes('fehler') || cat.toLowerCase().includes('dtc')) {
      return 'Diagnose / Fehlercodes';
    }
  }
  return TASK_TYPE_LABEL_DE[task.type] ?? task.type.replace(/_/g, ' ');
}

export const TASK_PRIORITY_LABEL_DE: Record<ApiTaskPriority, string> = {
  LOW: 'Niedrig',
  NORMAL: 'Normal',
  HIGH: 'Hoch',
  CRITICAL: 'Kritisch',
};

export const TASK_STATUS_LABEL_DE: Record<ApiTaskStatus, string> = {
  OPEN: 'Offen',
  IN_PROGRESS: 'In Bearbeitung',
  WAITING: 'Wartet',
  DONE: 'Erledigt',
  CANCELLED: 'Storniert',
};

export type ServiceBoardColumn =
  | 'open'
  | 'scheduled'
  | 'in-progress'
  | 'waiting-vendor'
  | 'done';

export const SERVICE_BOARD_COLUMNS: Array<{ id: ServiceBoardColumn; label: string }> = [
  { id: 'open', label: 'Offen' },
  { id: 'scheduled', label: 'Geplant' },
  { id: 'in-progress', label: 'In Bearbeitung' },
  { id: 'waiting-vendor', label: 'Wartet Partner' },
  { id: 'done', label: 'Erledigt' },
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
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

export function buildVehicleLabel(vehicle: {
  license?: string;
  make?: string;
  model?: string;
  year?: number;
} | null | undefined): string {
  if (!vehicle) return '—';
  const mmy = [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ');
  return vehicle.license ? `${vehicle.license}${mmy ? ` · ${mmy}` : ''}` : mmy || '—';
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
