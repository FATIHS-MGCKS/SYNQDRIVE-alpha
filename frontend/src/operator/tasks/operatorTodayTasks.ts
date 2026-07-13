import type { ApiTask } from '../../lib/api';
import { sortOperatorTasks } from './operatorTask.utils';

export const BOOKING_LIFECYCLE_TASK_TYPES = new Set<ApiTask['type']>([
  'BOOKING_PREPARATION',
  'VEHICLE_CLEANING',
  'DOCUMENT_REVIEW',
]);

export const VEHICLE_CHECK_TASK_TYPES = new Set<ApiTask['type']>([
  'VEHICLE_INSPECTION',
  'TIRE_CHECK',
  'BRAKE_CHECK',
  'BATTERY_CHECK',
]);

export type OperatorTodayTaskEntry =
  | { kind: 'task'; task: ApiTask }
  | { kind: 'booking-group'; bookingId: string; tasks: ApiTask[]; vehicleId: string | null };

const LIFECYCLE_STEP_LABEL: Partial<Record<ApiTask['type'], string>> = {
  BOOKING_PREPARATION: 'Vorbereiten',
  VEHICLE_CLEANING: 'Reinigen',
  DOCUMENT_REVIEW: 'Dokumente',
};

export function bookingLifecycleStepLabel(type: ApiTask['type']): string {
  return LIFECYCLE_STEP_LABEL[type] ?? type;
}

export function buildOperatorTodayTaskEntries(tasks: ApiTask[]): OperatorTodayTaskEntry[] {
  const sorted = sortOperatorTasks(tasks);
  const groupsByBooking = new Map<string, ApiTask[]>();

  for (const task of sorted) {
    if (!task.bookingId || !BOOKING_LIFECYCLE_TASK_TYPES.has(task.type)) continue;
    const group = groupsByBooking.get(task.bookingId) ?? [];
    group.push(task);
    groupsByBooking.set(task.bookingId, group);
  }

  const entries: OperatorTodayTaskEntry[] = [];
  const emittedBookings = new Set<string>();

  for (const task of sorted) {
    const bookingId = task.bookingId;
    if (bookingId && BOOKING_LIFECYCLE_TASK_TYPES.has(task.type)) {
      if (emittedBookings.has(bookingId)) continue;
      emittedBookings.add(bookingId);
      const group = sortOperatorTasks(groupsByBooking.get(bookingId) ?? [task]);
      if (group.length >= 2) {
        entries.push({
          kind: 'booking-group',
          bookingId,
          tasks: group,
          vehicleId: group.find((row) => row.vehicleId)?.vehicleId ?? null,
        });
      } else if (group[0]) {
        entries.push({ kind: 'task', task: group[0] });
      }
      continue;
    }
    entries.push({ kind: 'task', task });
  }

  return entries;
}

export function summarizeBookingTaskGroup(tasks: ApiTask[]): string {
  return tasks.map((task) => bookingLifecycleStepLabel(task.type)).join(' · ');
}

export function isVehicleCheckTask(task: ApiTask): boolean {
  return (
    (VEHICLE_CHECK_TASK_TYPES.has(task.type) || task.blocksVehicleAvailability) &&
    !BOOKING_LIFECYCLE_TASK_TYPES.has(task.type)
  );
}
