import type { ApiTaskType } from './types';

export interface TaskResolutionCodeOption {
  value: string;
  label: string;
}

const RESOLUTION_CODE_LABELS: Record<string, string> = {
  TIRE_REPLACED: 'Reifen ersetzt',
  TIRE_ROTATED: 'Reifen rotiert',
  TIRE_MEASURED_OK: 'Messwerte in Ordnung',
  BRAKE_MEASURED_OK: 'Bremsen in Ordnung',
  BRAKE_PARTS_REPLACED: 'Bremsenteile ersetzt',
  BATTERY_REPLACED: 'Batterie ersetzt',
  BATTERY_MEASURED_OK: 'Batterie in Ordnung',
  VEHICLE_CLEANED: 'Fahrzeug gereinigt',
  SERVICE_SCHEDULED: 'Service terminiert',
  SERVICE_ALREADY_COMPLETED: 'Service bereits erledigt',
  SERVICE_DUE_DATE_CORRECTED: 'Fälligkeit korrigiert',
  FALSE_POSITIVE: 'Fehlalarm',
  SERVICE_CASE_COMPLETED: 'Servicefall abgeschlossen',
  TUV_SCHEDULED: 'HU/TÜV terminiert',
  TUV_PASSED: 'HU/TÜV bestanden',
  TUV_FAILED: 'HU/TÜV nicht bestanden',
  REPAIR_COMPLETED: 'Reparatur abgeschlossen',
  PARTS_REPLACED: 'Teile ersetzt',
  OTHER: 'Sonstiges',
};

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

export function getTaskResolutionCodeOptions(type: ApiTaskType): TaskResolutionCodeOption[] {
  const codes = TASK_TYPE_RESOLUTION_CODES[type] ?? [];
  return codes.map((value) => ({
    value,
    label: RESOLUTION_CODE_LABELS[value] ?? value.replace(/_/g, ' '),
  }));
}

export function taskRequiresResolutionCode(type: ApiTaskType): boolean {
  return (TASK_TYPE_RESOLUTION_CODES[type]?.length ?? 0) > 0;
}

export function taskShowsCostFields(type: ApiTaskType): boolean {
  return COST_CAPTURE_TASK_TYPES.includes(type);
}

export function formatResolutionCodeLabel(code: string | null | undefined): string | null {
  if (!code?.trim()) return null;
  return RESOLUTION_CODE_LABELS[code] ?? code.replace(/_/g, ' ');
}
