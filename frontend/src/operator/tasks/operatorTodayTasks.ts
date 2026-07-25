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

/** Hide handover task cards when a dedicated booking handover card is shown in the same bucket. */
export function shouldSuppressTaskForHandoverCard(
  task: ApiTask,
  suppressedHandoverKeys: Set<string>,
): boolean {
  if (!task.bookingId) return false;
  if (task.type === 'BOOKING_PICKUP') {
    return suppressedHandoverKeys.has(`${task.bookingId}:PICKUP`);
  }
  if (task.type === 'BOOKING_RETURN') {
    return suppressedHandoverKeys.has(`${task.bookingId}:RETURN`);
  }
  return false;
}

export function filterTasksWithoutHandoverDuplicates(
  tasks: ApiTask[],
  suppressedHandoverKeys: Set<string>,
): ApiTask[] {
  if (suppressedHandoverKeys.size === 0) return tasks;
  return tasks.filter((task) => !shouldSuppressTaskForHandoverCard(task, suppressedHandoverKeys));
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
