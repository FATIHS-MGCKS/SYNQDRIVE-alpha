import type { ActionQueueCta } from '../../components/dashboard/dashboardTypes';
import type {
  ApiNotificationActionTarget,
  ApiNotificationActionType,
} from './notification-api.types';
import type { NotificationActionTarget, NotificationActionType } from '../../components/dashboard/notificationQueueModel';

const API_TO_QUEUE_ACTION: Record<ApiNotificationActionType, NotificationActionType> = {
  OPEN_VEHICLE: 'open-vehicle',
  OPEN_VEHICLE_MODULE: 'open-vehicle-module',
  OPEN_BOOKING: 'open-booking',
  OPEN_HANDOVER_PICKUP: 'open-handover-pickup',
  OPEN_HANDOVER_RETURN: 'open-handover-return',
  OPEN_STATION: 'open-station',
  OPEN_BILLING: 'open-billing',
  OPEN_RENTAL: 'open-rental',
};

const API_TO_LEGACY_CTA: Record<ApiNotificationActionType, ActionQueueCta> = {
  OPEN_VEHICLE: 'open-vehicle',
  OPEN_VEHICLE_MODULE: 'open-vehicle',
  OPEN_BOOKING: 'open-booking',
  OPEN_HANDOVER_PICKUP: 'start-handover-pickup',
  OPEN_HANDOVER_RETURN: 'start-handover-return',
  OPEN_STATION: 'open-stations',
  OPEN_BILLING: 'open-rental',
  OPEN_RENTAL: 'open-rental',
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
    module: target.module,
  };
}

export function isKnownApiActionType(type: string): type is ApiNotificationActionType {
  return type in API_TO_QUEUE_ACTION;
}

export interface NotificationV2NavigationHandlers {
  onOpenVehicleById?: (vehicleId: string) => void;
  onOpenBookingById?: (bookingId: string) => void;
  onOpenInvoiceById?: (invoiceId: string) => void;
  onOpenRentalView?: (view: 'bookings' | 'stations') => void;
  onStartHandoverPickup?: (bookingId: string) => void;
  onStartHandoverReturn?: (bookingId: string) => void;
}

/**
 * Navigate using backend `action.type` + `action.target` only.
 * Returns true when V2 routing handled the click.
 */
export function navigateNotificationV2Action(
  item: import('../../components/dashboard/dashboardTypes').ActionQueueItem,
  handlers: NotificationV2NavigationHandlers,
): boolean {
  if (item.source !== 'notifications-v2' || !item.queue?.actionTarget) return false;

  const target = item.queue.actionTarget;
  const actionType = item.queue.actionType;

  switch (actionType) {
    case 'open-vehicle':
    case 'open-vehicle-module':
      if (target.vehicleId) {
        handlers.onOpenVehicleById?.(target.vehicleId);
        return true;
      }
      break;
    case 'open-booking':
      if (target.bookingId) {
        handlers.onOpenBookingById?.(target.bookingId);
        return true;
      }
      handlers.onOpenRentalView?.('bookings');
      return true;
    case 'open-handover-pickup':
      if (target.bookingId) handlers.onStartHandoverPickup?.(target.bookingId);
      return true;
    case 'open-handover-return':
      if (target.bookingId) handlers.onStartHandoverReturn?.(target.bookingId);
      return true;
    case 'open-station':
      handlers.onOpenRentalView?.('stations');
      return true;
    case 'open-billing':
      if (target.invoiceId && handlers.onOpenInvoiceById) {
        handlers.onOpenInvoiceById(target.invoiceId);
        return true;
      }
      handlers.onOpenRentalView?.('bookings');
      return true;
    case 'open-rental':
    default:
      handlers.onOpenRentalView?.('bookings');
      return true;
  }

  handlers.onOpenRentalView?.('bookings');
  return true;
}
