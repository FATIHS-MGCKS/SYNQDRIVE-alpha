import { TaskType } from '@prisma/client';

/** Completing one of these requires a resolution note (operational evidence). */
export const RESOLUTION_REQUIRED_TYPES: TaskType[] = [
  'REPAIR',
  'BRAKE_CHECK',
  'TIRE_CHECK',
  'BATTERY_CHECK',
  'VEHICLE_SERVICE',
  'VEHICLE_INSPECTION',
];
