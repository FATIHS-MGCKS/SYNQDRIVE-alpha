import type { ApiTaskType } from './types';
import { taskDetailResolutionCodeLabel } from './task-detail-actions-presentation-i18n';

export interface TaskResolutionCodeOption {
  value: string;
  label: string;
}

const TASK_TYPE_RESOLUTION_CODES: Partial<Record<ApiTaskType, string[]>> = {
  TIRE_CHECK: ['TIRE_REPLACED', 'TIRE_ROTATED', 'TIRE_MEASURED_OK', 'OTHER'],
  BRAKE_CHECK: ['BRAKE_MEASURED_OK', 'BRAKE_PARTS_REPLACED', 'OTHER'],
  BATTERY_CHECK: ['BATTERY_REPLACED', 'BATTERY_MEASURED_OK', 'OTHER'],
  VEHICLE_CLEANING: ['VEHICLE_CLEANED'],
  VEHICLE_SERVICE: [
    'SERVICE_SCHEDULED',
    'SERVICE_ALREADY_COMPLETED',
    'SERVICE_DUE_DATE_CORRECTED',
    'FALSE_POSITIVE',
    'SERVICE_CASE_COMPLETED',
  ],
  VEHICLE_INSPECTION: ['TUV_SCHEDULED', 'TUV_PASSED', 'TUV_FAILED', 'OTHER'],
  REPAIR: ['REPAIR_COMPLETED', 'PARTS_REPLACED', 'OTHER'],
};

const COST_CAPTURE_TASK_TYPES: ApiTaskType[] = [
  'REPAIR',
  'VEHICLE_SERVICE',
  'BRAKE_CHECK',
  'TIRE_CHECK',
  'BATTERY_CHECK',
  'VEHICLE_INSPECTION',
];

export function getTaskResolutionCodeOptions(
  type: ApiTaskType,
  locale: string,
): TaskResolutionCodeOption[] {
  const codes = TASK_TYPE_RESOLUTION_CODES[type] ?? [];
  return codes.map((value) => ({
    value,
    label: taskDetailResolutionCodeLabel(locale, value),
  }));
}

export function taskRequiresResolutionCode(type: ApiTaskType): boolean {
  return (TASK_TYPE_RESOLUTION_CODES[type]?.length ?? 0) > 0;
}

export function taskShowsCostFields(type: ApiTaskType): boolean {
  return COST_CAPTURE_TASK_TYPES.includes(type);
}

export function formatResolutionCodeLabel(
  code: string | null | undefined,
  locale: string,
): string | null {
  if (!code?.trim()) return null;
  return taskDetailResolutionCodeLabel(locale, code);
}
