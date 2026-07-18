import { NotificationEntityType, type TaskType } from '@prisma/client';
import type {
  StationOperationsNotificationCategory,
  StationOperationsTaskCategory,
} from './station-operations-summary.contract';
import {
  isOrgWideNotificationForStationSummary,
  isStationAttributableNotification,
  type StationNotificationAttributionRow,
} from './station-notification-attribution.util';

export interface StationOperationsTaskInput {
  id: string;
  type: TaskType;
  vehicleId: string | null;
  bookingId: string | null;
  metadata: unknown;
}

export type StationOperationsNotificationInput = StationNotificationAttributionRow;

export interface StationOperationsBookingSnapshot {
  id: string;
  status: string;
  pickupStationId: string | null;
  returnStationId: string | null;
  startDate: Date;
  endDate: Date;
}

export interface StationOperationsClassificationContext {
  stationId: string;
  evaluatedAt: Date;
  onSiteVehicleIds: ReadonlySet<string>;
  stationBookingIds: ReadonlySet<string>;
  bookingsById: ReadonlyMap<string, StationOperationsBookingSnapshot>;
  activeTransferIds: ReadonlySet<string>;
  bookingTaskTypes: ReadonlySet<TaskType>;
}

function bookingLinksToStation(
  booking: Pick<StationOperationsBookingSnapshot, 'pickupStationId' | 'returnStationId'>,
  stationId: string,
): boolean {
  return booking.pickupStationId === stationId || booking.returnStationId === stationId;
}

function readMetadataString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isBookingTaskType(
  type: TaskType,
  bookingTaskTypes: ReadonlySet<TaskType>,
): boolean {
  return bookingTaskTypes.has(type);
}

function isPickupOverdue(
  booking: StationOperationsBookingSnapshot,
  stationId: string,
  evaluatedAt: Date,
): boolean {
  if (booking.pickupStationId !== stationId) {
    return false;
  }
  if (!['CONFIRMED', 'PENDING', 'ACTIVE'].includes(booking.status)) {
    return false;
  }
  return booking.startDate.getTime() < evaluatedAt.getTime();
}

function isReturnOverdue(
  booking: StationOperationsBookingSnapshot,
  stationId: string,
  evaluatedAt: Date,
): boolean {
  if (booking.returnStationId !== stationId) {
    return false;
  }
  if (booking.status !== 'ACTIVE') {
    return false;
  }
  return booking.endDate.getTime() < evaluatedAt.getTime();
}

export function isTaskAttributableToStation(
  task: StationOperationsTaskInput,
  context: StationOperationsClassificationContext,
): boolean {
  if (readMetadataString(task.metadata, 'stationId') === context.stationId) {
    return true;
  }

  const transferId = readMetadataString(task.metadata, 'transferId');
  if (transferId && context.activeTransferIds.has(transferId)) {
    return true;
  }

  if (task.bookingId && context.stationBookingIds.has(task.bookingId)) {
    return true;
  }

  if (task.vehicleId && context.onSiteVehicleIds.has(task.vehicleId)) {
    return true;
  }

  return false;
}

export function classifyStationTask(
  task: StationOperationsTaskInput,
  context: StationOperationsClassificationContext,
): StationOperationsTaskCategory | null {
  if (!isTaskAttributableToStation(task, context)) {
    return null;
  }

  if (readMetadataString(task.metadata, 'stationId') === context.stationId) {
    return 'stationLinked';
  }

  const transferId = readMetadataString(task.metadata, 'transferId');
  if (transferId && context.activeTransferIds.has(transferId)) {
    return 'transfer';
  }

  if (task.bookingId) {
    const booking = context.bookingsById.get(task.bookingId);
    if (booking && bookingLinksToStation(booking, context.stationId)) {
      if (
        isBookingTaskType(task.type, context.bookingTaskTypes) &&
        (isPickupOverdue(booking, context.stationId, context.evaluatedAt) ||
          isReturnOverdue(booking, context.stationId, context.evaluatedAt))
      ) {
        return 'overduePickupReturn';
      }
      if (isBookingTaskType(task.type, context.bookingTaskTypes)) {
        return 'bookingPickupReturn';
      }
    }
  }

  if (task.vehicleId && context.onSiteVehicleIds.has(task.vehicleId)) {
    return 'vehicleOnSite';
  }

  if (task.bookingId && context.stationBookingIds.has(task.bookingId)) {
    return 'bookingPickupReturn';
  }

  return null;
}

export function classifyStationNotification(
  notification: StationOperationsNotificationInput,
  context: StationOperationsClassificationContext,
): StationOperationsNotificationCategory | null {
  if (
    !isStationAttributableNotification(
      notification,
      context.stationId,
      context.onSiteVehicleIds,
      context.stationBookingIds,
      context.activeTransferIds,
    )
  ) {
    return null;
  }

  if (isOrgWideNotificationForStationSummary(notification)) {
    return null;
  }

  const target = (notification.actionTarget ?? {}) as Record<string, string | undefined>;
  const targetStationId =
    notification.entityType === NotificationEntityType.STATION
      ? notification.entityId
      : target.stationId;
  if (targetStationId === context.stationId) {
    return 'stationLinked';
  }

  const transferId = target.transferId;
  if (transferId && context.activeTransferIds.has(transferId)) {
    return 'transfer';
  }

  const bookingId =
    notification.entityType === NotificationEntityType.BOOKING
      ? notification.entityId
      : target.bookingId;
  if (bookingId && context.stationBookingIds.has(bookingId)) {
    return 'bookingPickupReturn';
  }

  const vehicleId =
    notification.entityType === NotificationEntityType.VEHICLE
      ? notification.entityId
      : target.vehicleId;
  if (vehicleId && context.onSiteVehicleIds.has(vehicleId)) {
    return 'vehicleOnSite';
  }

  return null;
}
