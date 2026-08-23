import type { ActionQueueCta } from '../../components/dashboard/dashboardTypes';
import type {
  ApiNotificationActionTarget,
  ApiNotificationActionType,
} from './notification-api.types';
import type { NotificationActionTarget, NotificationActionType } from '../../components/dashboard/notificationQueueModel';
import type { ActionQueueItem } from '../../components/dashboard/dashboardTypes';
import {
  navigateNotificationEntity,
  type NotificationNavigationHandlers,
} from './notification-entity-navigation';

const API_TO_QUEUE_ACTION: Record<ApiNotificationActionType, NotificationActionType> = {
  OPEN_VEHICLE: 'open-vehicle',
  OPEN_VEHICLE_MODULE: 'open-vehicle-module',
  OPEN_BOOKING: 'open-booking',
  OPEN_HANDOVER_PICKUP: 'open-handover-pickup',
  OPEN_HANDOVER_RETURN: 'open-handover-return',
  OPEN_STATION: 'open-station',
  OPEN_BILLING: 'open-billing',
  OPEN_RENTAL: 'open-rental',
  OPEN_COMMUNICATION: 'open-communication',
};

const API_TO_LEGACY_CTA: Record<ApiNotificationActionType, ActionQueueCta> = {
  OPEN_VEHICLE: 'open-vehicle',
  OPEN_VEHICLE_MODULE: 'open-vehicle-module',
  OPEN_BOOKING: 'open-booking',
  OPEN_HANDOVER_PICKUP: 'start-handover-pickup',
  OPEN_HANDOVER_RETURN: 'start-handover-return',
  OPEN_STATION: 'open-stations',
  OPEN_BILLING: 'open-rental',
  OPEN_RENTAL: 'open-rental',
  OPEN_COMMUNICATION: 'open-rental',
};

export function mapApiActionType(type: ApiNotificationActionType | string): NotificationActionType {
  return API_TO_QUEUE_ACTION[type as ApiNotificationActionType] ?? 'open-rental';
}

export function mapApiActionToLegacyCta(type: ApiNotificationActionType | string): ActionQueueCta {
  return API_TO_LEGACY_CTA[type as ApiNotificationActionType] ?? 'open-rental';
}

export function mapApiActionTarget(
  type: ApiNotificationActionType | string,
  target: ApiNotificationActionTarget,
): NotificationActionTarget {
  const queueType = mapApiActionType(type);
  return {
    type: queueType,
    vehicleId: target.vehicleId,
    bookingId: target.bookingId,
    stationId: target.stationId,
    customerId: target.customerId,
    invoiceId: target.invoiceId,
    tripId: target.tripId,
    observationId: target.observationId,
    taskId: target.taskId,
    conversationId: target.conversationId,
    channel: target.channel,
    module: target.module,
  };
}

export function isKnownApiActionType(type: string): type is ApiNotificationActionType {
  return type in API_TO_QUEUE_ACTION;
}

export type NotificationV2NavigationHandlers = NotificationNavigationHandlers;

/** Navigate using backend `action.type` + `action.target` only. */
export function navigateNotificationV2Action(
  item: ActionQueueItem,
  handlers: NotificationV2NavigationHandlers,
  organizationId = '',
): boolean {
  if (!item.queue?.actionTarget) return false;
  return navigateNotificationEntity(item, organizationId, handlers);
}
