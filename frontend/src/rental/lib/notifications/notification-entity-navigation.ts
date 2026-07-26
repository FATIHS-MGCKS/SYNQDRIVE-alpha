import type { ActionQueueItem } from '../../components/dashboard/dashboardTypes';
import type {
  NotificationActionTarget,
  NotificationActionType,
  NotificationEntityType,
} from '../../components/dashboard/notificationQueueModel';
import type { RentalEntityNavigationValue } from '../../context/RentalEntityNavigationContext';

export type NotificationNavigationKind =
  | 'vehicle'
  | 'vehicle-module'
  | 'booking'
  | 'handover-pickup'
  | 'handover-return'
  | 'station'
  | 'invoice'
  | 'customer'
  | 'observation'
  | 'task'
  | 'trip'
  | 'settings'
  | 'rental-fallback'
  | 'unavailable';

export interface NotificationNavigationContext {
  organizationId: string;
  entityType: NotificationEntityType;
  entityId: string;
  entityAvailable: boolean;
  actionType: NotificationActionType;
  target: NotificationActionTarget;
  displayLabel?: string;
}

export interface NotificationNavigationIntent {
  kind: NotificationNavigationKind;
  context: NotificationNavigationContext;
}

export type NotificationNavigationOutcome =
  | 'navigated'
  | 'entity_unavailable'
  | 'no_handler'
  | 'unsupported';

export interface NotificationNavigationHandlers extends RentalEntityNavigationValue {
  onOpenRentalView?: (view: 'bookings' | 'stations') => void;
  onOpenSettingsTab?: (tab: string) => void;
  onStartHandoverPickup?: (bookingId: string) => void;
  onStartHandoverReturn?: (bookingId: string) => void;
  onEntityUnavailable?: (intent: NotificationNavigationIntent) => void;
  /** @deprecated use openVehicleById */
  onOpenVehicleById?: RentalEntityNavigationValue['openVehicleById'];
  /** @deprecated use openBookingById */
  onOpenBookingById?: RentalEntityNavigationValue['openBookingById'];
  /** @deprecated use openInvoiceById */
  onOpenInvoiceById?: RentalEntityNavigationValue['openInvoiceById'];
  /** @deprecated use openCustomerById */
  onOpenCustomerById?: RentalEntityNavigationValue['openCustomerById'];
}

function resolveHandlers(handlers: NotificationNavigationHandlers) {
  return {
    openVehicleById: handlers.openVehicleById ?? handlers.onOpenVehicleById,
    openBookingById: handlers.openBookingById ?? handlers.onOpenBookingById,
    openInvoiceById: handlers.openInvoiceById ?? handlers.onOpenInvoiceById,
    openCustomerById: handlers.openCustomerById ?? handlers.onOpenCustomerById,
    openAlertById: handlers.openAlertById,
    openServiceCaseById: handlers.openServiceCaseById,
    onOpenRentalView: handlers.onOpenRentalView,
    onOpenSettingsTab: handlers.onOpenSettingsTab,
    onStartHandoverPickup: handlers.onStartHandoverPickup,
    onStartHandoverReturn: handlers.onStartHandoverReturn,
    onEntityUnavailable: handlers.onEntityUnavailable,
  };
}

function isUuidLike(value: string | undefined | null): boolean {
  if (!value?.trim()) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

function resolveTarget(item: ActionQueueItem): NotificationActionTarget {
  const queueTarget = item.queue?.actionTarget;
  if (queueTarget) return queueTarget;

  return {
    type: item.queue?.actionType ?? 'open-rental',
    vehicleId: item.vehicleId,
    bookingId: item.bookingId,
    stationId: item.stationId,
    customerId: item.customerId,
    invoiceId: item.invoiceId,
  };
}

function resolveActionType(item: ActionQueueItem, target: NotificationActionTarget): NotificationActionType {
  return item.queue?.actionType ?? target.type ?? 'open-rental';
}

function resolveEntityType(item: ActionQueueItem): NotificationEntityType {
  return item.queue?.entityType ?? 'organization';
}

function resolveEntityId(item: ActionQueueItem, target: NotificationActionTarget): string {
  return item.queue?.entityId
    ?? target.vehicleId
    ?? target.bookingId
    ?? target.stationId
    ?? target.customerId
    ?? target.invoiceId
    ?? item.id;
}

/** Build typed navigation context from a queue item — never from free-form title text. */
export function buildNotificationNavigationContext(
  item: ActionQueueItem,
  organizationId: string,
): NotificationNavigationContext {
  const target = resolveTarget(item);
  const actionType = resolveActionType(item, target);
  const entityType = resolveEntityType(item);
  const entityId = resolveEntityId(item, target);
  const entityAvailable = item.entityAvailable !== false;

  return {
    organizationId,
    entityType,
    entityId,
    entityAvailable,
    actionType,
    target,
    displayLabel: item.entityLabel && !isUuidLike(item.entityLabel) ? item.entityLabel : undefined,
  };
}

function kindFromAction(
  actionType: NotificationActionType,
  target: NotificationActionTarget,
): NotificationNavigationKind {
  if (target.observationId && target.vehicleId) return 'observation';
  if (target.taskId) return 'task';

  switch (actionType) {
    case 'open-vehicle-module':
      return 'vehicle-module';
    case 'open-vehicle':
      return 'vehicle';
    case 'open-booking':
      return 'booking';
    case 'open-handover-pickup':
      return 'handover-pickup';
    case 'open-handover-return':
      return 'handover-return';
    case 'open-station':
      return 'station';
    case 'open-billing':
      return target.invoiceId ? 'invoice' : 'rental-fallback';
    default:
      if (target.module?.startsWith('settings:')) return 'settings';
      if (target.customerId) return 'customer';
      if (target.tripId) return 'trip';
      return 'rental-fallback';
  }
}

export function resolveNotificationNavigationIntent(
  item: ActionQueueItem,
  organizationId: string,
): NotificationNavigationIntent {
  const context = buildNotificationNavigationContext(item, organizationId);
  if (!context.entityAvailable) {
    return { kind: 'unavailable', context };
  }
  return {
    kind: kindFromAction(context.actionType, context.target),
    context,
  };
}

function openVehicleModule(
  handlers: ReturnType<typeof resolveHandlers>,
  vehicleId: string,
  module?: string,
): boolean {
  if (!handlers.openVehicleById) return false;
  if (module === 'trips') {
    handlers.openVehicleById(vehicleId, { module: 'trips' });
    return true;
  }
  if (module) {
    handlers.openVehicleById(vehicleId, { module });
    return true;
  }
  handlers.openVehicleById(vehicleId);
  return true;
}

/** Execute navigation for a resolved intent. Never routes from localized text. */
export function executeNotificationNavigation(
  intent: NotificationNavigationIntent,
  handlers: NotificationNavigationHandlers,
): NotificationNavigationOutcome {
  const h = resolveHandlers(handlers);

  if (intent.kind === 'unavailable' || !intent.context.entityAvailable) {
    h.onEntityUnavailable?.(intent);
    return 'entity_unavailable';
  }

  const { target } = intent.context;

  switch (intent.kind) {
    case 'observation':
      if (target.observationId && h.openAlertById) {
        h.openAlertById(target.observationId, { vehicleId: target.vehicleId ?? null });
        return 'navigated';
      }
      if (target.vehicleId && openVehicleModule(h, target.vehicleId, 'complaints')) {
        return 'navigated';
      }
      break;
    case 'task':
      if (target.taskId && h.openServiceCaseById) {
        h.openServiceCaseById(target.taskId, { vehicleId: target.vehicleId ?? null });
        return 'navigated';
      }
      break;
    case 'vehicle-module':
      if (target.vehicleId && openVehicleModule(h, target.vehicleId, target.module)) {
        return 'navigated';
      }
      break;
    case 'vehicle':
      if (target.vehicleId && h.openVehicleById) {
        h.openVehicleById(target.vehicleId);
        return 'navigated';
      }
      break;
    case 'booking':
      if (target.bookingId && h.openBookingById) {
        h.openBookingById(target.bookingId);
        return 'navigated';
      }
      break;
    case 'handover-pickup':
      if (target.bookingId && h.onStartHandoverPickup) {
        h.onStartHandoverPickup(target.bookingId);
        return 'navigated';
      }
      if (target.bookingId && h.openBookingById) {
        h.openBookingById(target.bookingId);
        return 'navigated';
      }
      break;
    case 'handover-return':
      if (target.bookingId && h.onStartHandoverReturn) {
        h.onStartHandoverReturn(target.bookingId);
        return 'navigated';
      }
      if (target.bookingId && h.openBookingById) {
        h.openBookingById(target.bookingId);
        return 'navigated';
      }
      break;
    case 'station':
      if (target.stationId && h.onOpenRentalView) {
        h.onOpenRentalView('stations');
        return 'navigated';
      }
      break;
    case 'invoice':
      if (target.invoiceId && h.openInvoiceById) {
        h.openInvoiceById(target.invoiceId);
        return 'navigated';
      }
      break;
    case 'customer':
      if (target.customerId && h.openCustomerById) {
        h.openCustomerById(target.customerId);
        return 'navigated';
      }
      break;
    case 'trip':
      if (target.tripId && target.vehicleId && openVehicleModule(h, target.vehicleId, 'trips')) {
        return 'navigated';
      }
      break;
    case 'settings': {
      const tab = target.module?.startsWith('settings:')
        ? target.module.slice('settings:'.length)
        : undefined;
      if (tab && h.onOpenSettingsTab) {
        h.onOpenSettingsTab(tab);
        return 'navigated';
      }
      break;
    }
    case 'rental-fallback':
    default:
      if (h.onOpenRentalView) {
        h.onOpenRentalView('bookings');
        return 'navigated';
      }
      break;
  }

  return 'no_handler';
}

/** Primary entry: resolve intent and navigate. Returns true when handled (including unavailable toast). */
export function navigateNotificationEntity(
  item: ActionQueueItem,
  organizationId: string,
  handlers: NotificationNavigationHandlers,
): boolean {
  const intent = resolveNotificationNavigationIntent(item, organizationId);
  const outcome = executeNotificationNavigation(intent, handlers);
  return outcome === 'navigated' || outcome === 'entity_unavailable';
}
