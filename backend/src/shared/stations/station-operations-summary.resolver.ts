import type { TaskType } from '@prisma/client';
import {
  STATION_OPERATIONS_BOOKING_TASK_TYPES,
  STATION_OPERATIONS_SUMMARY_VERSION,
  StationOperationsNotificationCategory,
  StationOperationsTaskCategory,
  type StationOperationsCategoryCount,
  type StationOperationsSummary,
} from './station-operations-summary.contract';
import type { StationOperationsReason } from './station-operations.contract';
import {
  classifyStationNotification,
  classifyStationTask,
  type StationOperationsBookingSnapshot,
  type StationOperationsNotificationInput,
  type StationOperationsTaskInput,
} from './station-operations-summary.classification';

export * from './station-operations-summary.contract';

export interface StationOperationsVehicleSnapshot {
  id: string;
  currentStationId: string | null;
}

export interface StationOperationsTransferSnapshot {
  id: string;
  fromStationId: string | null;
  toStationId: string;
}

export interface ResolveStationOperationsSummaryInput {
  stationId: string;
  evaluatedAt: string;
  tasks: StationOperationsTaskInput[];
  notifications: StationOperationsNotificationInput[];
  vehicles: StationOperationsVehicleSnapshot[];
  bookings: StationOperationsBookingSnapshot[];
  transfers: StationOperationsTransferSnapshot[];
  configurationProblems: StationOperationsReason[];
  operationalWarnings: StationOperationsReason[];
}

function emptyCategoryCounts<T extends string>(
  categories: Record<string, T>,
): Record<T, StationOperationsCategoryCount> {
  return Object.values(categories).reduce(
    (acc, category) => {
      acc[category as T] = { count: 0 };
      return acc;
    },
    {} as Record<T, StationOperationsCategoryCount>,
  );
}

function countByCategory<T extends string>(
  items: Array<{ id: string; category: T | null }>,
  categories: Record<string, T>,
): { total: number; categories: Record<T, StationOperationsCategoryCount> } {
  const categoryCounts = emptyCategoryCounts(categories);
  const seen = new Set<string>();

  for (const item of items) {
    if (!item.category || seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    categoryCounts[item.category].count += 1;
  }

  return {
    total: seen.size,
    categories: categoryCounts,
  };
}

export function resolveStationOperationsSummary(
  input: ResolveStationOperationsSummaryInput,
): StationOperationsSummary {
  const evaluatedAt = new Date(input.evaluatedAt);
  const onSiteVehicleIds = new Set(
    input.vehicles
      .filter((vehicle) => vehicle.currentStationId === input.stationId)
      .map((vehicle) => vehicle.id),
  );
  const stationBookingIds = new Set(
    input.bookings
      .filter(
        (booking) =>
          booking.pickupStationId === input.stationId ||
          booking.returnStationId === input.stationId,
      )
      .map((booking) => booking.id),
  );
  const bookingsById = new Map(input.bookings.map((booking) => [booking.id, booking]));
  const activeTransferIds = new Set(
    input.transfers
      .filter(
        (transfer) =>
          transfer.fromStationId === input.stationId ||
          transfer.toStationId === input.stationId,
      )
      .map((transfer) => transfer.id),
  );

  const classificationContext = {
    stationId: input.stationId,
    evaluatedAt,
    onSiteVehicleIds,
    stationBookingIds,
    bookingsById,
    activeTransferIds,
    bookingTaskTypes: new Set<TaskType>(STATION_OPERATIONS_BOOKING_TASK_TYPES),
  };

  const classifiedTasks = input.tasks.map((task) => ({
    id: task.id,
    category: classifyStationTask(task, classificationContext),
  }));

  const classifiedNotifications = input.notifications.map((notification) => ({
    id: notification.id,
    category: classifyStationNotification(notification, classificationContext),
  }));

  const tasks = countByCategory(classifiedTasks, StationOperationsTaskCategory);
  const notifications = countByCategory(
    classifiedNotifications,
    StationOperationsNotificationCategory,
  );

  const configurationProblems = input.configurationProblems.length;
  const operationalWarnings = input.operationalWarnings.length;

  return {
    version: STATION_OPERATIONS_SUMMARY_VERSION,
    stationId: input.stationId,
    evaluatedAt: input.evaluatedAt,
    tasks,
    notifications,
    operationalProblems: {
      configurationProblems,
      operationalWarnings,
      total: configurationProblems + operationalWarnings,
    },
  };
}

export function countDedupedOpenOperationalTasks(
  input: ResolveStationOperationsSummaryInput,
): number {
  return resolveStationOperationsSummary(input).tasks.total;
}

export type {
  StationOperationsNotificationInput,
  StationOperationsTaskInput,
  StationOperationsBookingSnapshot,
} from './station-operations-summary.classification';

export function toStationOperationsTaskInput(
  task: StationOperationsTaskInput,
): StationOperationsTaskInput {
  return task;
}
