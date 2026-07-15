import type { ApiTask } from '../../lib/api';
import { sortOperatorTasks } from './operatorTask.utils';

export const VEHICLE_CHECK_TASK_TYPES = new Set<ApiTask['type']>([
  'VEHICLE_INSPECTION',
  'TIRE_CHECK',
  'BRAKE_CHECK',
  'BATTERY_CHECK',
]);

export type OperatorTodayTaskEntry = { kind: 'task'; task: ApiTask };

export function isAggregatedDocumentPackageTask(task: ApiTask): boolean {
  return task.type === 'DOCUMENT_REVIEW' && Boolean(task.dedupKey?.startsWith('document:package:'));
}

export function isLegacyPerTypeDocumentTask(task: ApiTask): boolean {
  if (!task.dedupKey || task.dedupKey.startsWith('document:package:')) return false;
  return /^document:[^:]+:/.test(task.dedupKey);
}

/** Hide legacy per-type document tasks when a canonical package task exists for the booking. */
export function filterCanonicalOperatorTasks(tasks: ApiTask[]): ApiTask[] {
  const bookingsWithPackageTask = new Set<string>();
  for (const task of tasks) {
    if (isAggregatedDocumentPackageTask(task) && task.bookingId) {
      bookingsWithPackageTask.add(task.bookingId);
    }
  }

  return tasks.filter((task) => {
    if (
      isLegacyPerTypeDocumentTask(task) &&
      task.bookingId &&
      bookingsWithPackageTask.has(task.bookingId)
    ) {
      return false;
    }
    return true;
  });
}

/** One card per backend task — no booking-level UI grouping. */
export function buildOperatorTodayTaskEntries(tasks: ApiTask[]): OperatorTodayTaskEntry[] {
  return sortOperatorTasks(filterCanonicalOperatorTasks(tasks)).map((task) => ({
    kind: 'task',
    task,
  }));
}

export function isVehicleCheckTask(task: ApiTask): boolean {
  return (
    (VEHICLE_CHECK_TASK_TYPES.has(task.type) || task.blocksVehicleAvailability) &&
    task.type !== 'BOOKING_PREPARATION' &&
    task.type !== 'DOCUMENT_REVIEW' &&
    task.type !== 'VEHICLE_CLEANING'
  );
}
