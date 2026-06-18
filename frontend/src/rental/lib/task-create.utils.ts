import type { ApiTaskType, CreateTaskPayload } from '../../lib/api';

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
