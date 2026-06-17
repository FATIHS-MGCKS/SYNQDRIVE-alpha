import { ServiceEventType } from '@prisma/client';

/** Event types shown in the general service history timeline. */
export const SERVICE_HISTORY_EVENT_TYPES: ServiceEventType[] = [
  'FULL_SERVICE',
  'GENERAL_INSPECTION',
  'OIL_CHANGE',
  'REPAIR',
  'BRAKE_SERVICE',
  'TIRE_ROTATION',
  'BATTERY_REPLACEMENT',
  'OTHER',
];

/**
 * Only these events may update denormalized `lastServiceDate` / `lastServiceOdometerKm`.
 * REPAIR and OIL_CHANGE are explicitly excluded — they are history only.
 */
export const FULL_SERVICE_BASELINE_EVENT_TYPES: ServiceEventType[] = [
  'FULL_SERVICE',
  'GENERAL_INSPECTION',
];

export const OIL_CHANGE_EVENT_TYPE: ServiceEventType = 'OIL_CHANGE';
