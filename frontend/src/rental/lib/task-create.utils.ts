import type { ApiTaskType, CreateTaskPayload } from '../../lib/api';
import type { TranslationKey } from '../../i18n/translations/en';

export type TaskCategory =
  | 'Cleaning'
  | 'Maintenance'
  | 'Repair'
  | 'Inspection'
  | 'Damage'
  | 'TÜV'
  | 'Insurance'
  | 'Documents'
  | 'Tire Change'
  | 'Oil Change';

export type TaskPriorityView = 'Low' | 'Medium' | 'High' | 'Critical';

export const TASK_CATEGORIES: readonly TaskCategory[] = [
  'Cleaning',
  'Maintenance',
  'Repair',
  'Inspection',
  'Damage',
  'TÜV',
  'Insurance',
  'Documents',
  'Tire Change',
  'Oil Change',
] as const;

export const TASK_PRIORITIES: readonly TaskPriorityView[] = ['Low', 'Medium', 'High', 'Critical'] as const;

/** View category → canonical backend TaskType. */
export const CATEGORY_TO_TASK_TYPE: Record<TaskCategory, ApiTaskType> = {
  Cleaning: 'VEHICLE_CLEANING',
  Maintenance: 'VEHICLE_SERVICE',
  Repair: 'REPAIR',
  Inspection: 'VEHICLE_INSPECTION',
  Damage: 'REPAIR',
  'TÜV': 'VEHICLE_INSPECTION',
  Insurance: 'CUSTOM',
  Documents: 'DOCUMENT_REVIEW',
  'Tire Change': 'TIRE_CHECK',
  'Oil Change': 'VEHICLE_SERVICE',
};

export const VIEW_PRIORITY_TO_API: Record<TaskPriorityView, NonNullable<CreateTaskPayload['priority']>> = {
  Low: 'LOW',
  Medium: 'NORMAL',
  High: 'HIGH',
  Critical: 'CRITICAL',
};

export const TASK_TYPE_LABEL_KEYS: Record<ApiTaskType, TranslationKey> = {
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
