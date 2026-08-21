/**
 * Shared service-task presentation helpers for cross-surface consumers
 * (service center, vendor tasks, vehicle detail, entity embeds).
 * Machine task type/status/priority/board values stay unchanged.
 */
import type { ApiTask, ApiTaskPriority, ApiTaskStatus, ApiTaskType } from '../api';
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type { ServiceBoardColumn } from '../../rental/lib/service-task-semantics';

export function resolveServiceTaskPresentationLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function stpi(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveServiceTaskPresentationLocale(locale), key, vars).text;
}

const TASK_TYPE_KEYS: Record<ApiTaskType, TranslationKey> = {
  VEHICLE_SERVICE: 'tasks.type.VEHICLE_SERVICE',
  VEHICLE_INSPECTION: 'tasks.type.VEHICLE_INSPECTION',
  TIRE_CHECK: 'tasks.type.TIRE_CHECK',
  BRAKE_CHECK: 'tasks.type.BRAKE_CHECK',
  BATTERY_CHECK: 'tasks.type.BATTERY_CHECK',
  VEHICLE_CLEANING: 'tasks.type.VEHICLE_CLEANING',
  BOOKING_PREPARATION: 'tasks.type.BOOKING_PREPARATION',
  BOOKING_PICKUP: 'tasks.type.BOOKING_PICKUP',
  BOOKING_RETURN: 'tasks.type.BOOKING_RETURN',
  DOCUMENT_REVIEW: 'tasks.type.DOCUMENT_REVIEW',
  INVOICE_REQUIRED: 'tasks.type.INVOICE_REQUIRED',
  CUSTOMER_FOLLOWUP: 'tasks.type.CUSTOMER_FOLLOWUP',
  REPAIR: 'tasks.type.REPAIR',
  CUSTOM: 'tasks.type.CUSTOM',
};

const TASK_STATUS_KEYS: Record<ApiTaskStatus, TranslationKey> = {
  OPEN: 'tasks.filter.status.OPEN',
  IN_PROGRESS: 'tasks.filter.status.IN_PROGRESS',
  WAITING: 'tasks.filter.status.WAITING',
  DONE: 'tasks.filter.status.DONE',
  CANCELLED: 'tasks.filter.status.CANCELLED',
};

const TASK_PRIORITY_KEYS: Record<ApiTaskPriority, TranslationKey> = {
  LOW: 'tasks.filter.priority.LOW',
  NORMAL: 'tasks.filter.priority.NORMAL',
  HIGH: 'tasks.filter.priority.HIGH',
  CRITICAL: 'tasks.filter.priority.CRITICAL',
};

const SERVICE_BOARD_COLUMN_KEYS: Record<ServiceBoardColumn, TranslationKey> = {
  open: 'tasks.serviceBoard.open',
  scheduled: 'tasks.serviceBoard.scheduled',
  'in-progress': 'tasks.serviceBoard.inProgress',
  'waiting-vendor': 'tasks.serviceBoard.waitingVendor',
  done: 'tasks.serviceBoard.done',
};

export const SERVICE_TASK_TYPE_VALUES = Object.keys(TASK_TYPE_KEYS) as ApiTaskType[];

export const SERVICE_TASK_STATUS_VALUES = Object.keys(TASK_STATUS_KEYS) as ApiTaskStatus[];

export const SERVICE_TASK_PRIORITY_VALUES = Object.keys(TASK_PRIORITY_KEYS) as ApiTaskPriority[];

export function serviceTaskTypeLabel(
  locale: string,
  task: Pick<ApiTask, 'type' | 'metadata' | 'category'>,
): string {
  const meta = task.metadata && typeof task.metadata === 'object' ? task.metadata : null;
  if (task.type === 'REPAIR' && meta && ('damageId' in meta || meta.origin === 'DAMAGE')) {
    return stpi(locale, 'tasks.type.repairDamage');
  }
  if (task.category?.trim()) {
    const cat = task.category.trim();
    if (cat.toLowerCase().includes('fehler') || cat.toLowerCase().includes('dtc')) {
      return stpi(locale, 'tasks.type.diagnostics');
    }
  }
  return stpi(locale, TASK_TYPE_KEYS[task.type] ?? 'tasks.type.CUSTOM');
}

export function serviceTaskTypeLabelForType(locale: string, type: ApiTaskType): string {
  return stpi(locale, TASK_TYPE_KEYS[type]);
}

export function serviceTaskStatusLabel(locale: string, status: ApiTaskStatus): string {
  return stpi(locale, TASK_STATUS_KEYS[status]);
}

export function serviceTaskPriorityLabel(locale: string, priority: ApiTaskPriority): string {
  return stpi(locale, TASK_PRIORITY_KEYS[priority]);
}

export function serviceBoardColumnLabel(locale: string, column: ServiceBoardColumn): string {
  return stpi(locale, SERVICE_BOARD_COLUMN_KEYS[column]);
}

export function serviceVehicleLabel(
  locale: string,
  vehicle: {
    license?: string;
    make?: string;
    model?: string;
    year?: number;
  } | null | undefined,
): string {
  if (!vehicle) return stpi(locale, 'tasks.vehicleLabel.unknown');
  const plate = vehicle.license?.trim();
  const isUuid =
    plate &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(plate);
  const mmy = [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ');
  if (plate && !isUuid) return `${plate}${mmy ? ` · ${mmy}` : ''}`;
  if (mmy) return mmy;
  return stpi(locale, 'tasks.vehicleLabel.noPlate');
}

export function serviceContextVehiclePrefix(locale: string): string {
  return stpi(locale, 'tasks.context.vehiclePrefix');
}

export function serviceBoardEmptyLabel(locale: string): string {
  return stpi(locale, 'tasks.serviceBoard.empty');
}
