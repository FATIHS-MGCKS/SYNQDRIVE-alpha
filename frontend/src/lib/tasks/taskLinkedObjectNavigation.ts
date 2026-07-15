import type { TaskLinkedObjectActionType } from './types';
import type { TaskDetailLinkedObjectModel } from './taskDetailView.utils';

export type TaskNavigationSurface = 'rental' | 'operator';

export interface TaskLinkedObjectNavigationHandlers {
  surface: TaskNavigationSurface;
  openVehicle?: (vehicleId: string) => void;
  openBooking?: (bookingId: string) => void;
  openCustomer?: (customerId: string) => void;
  openInvoice?: (invoiceId: string) => void;
  openDocument?: (documentId: string, options?: { vehicleId?: string | null; module?: string | null }) => void;
  openAlert?: (alertId: string, options?: { vehicleId?: string | null }) => void;
  openServiceCase?: (serviceCaseId: string, options?: { vehicleId?: string | null }) => void;
  openFine?: (fineId: string) => void;
  openVendor?: (vendorId: string) => void;
  onBlocked?: (message: string) => void;
}

export interface TaskLinkedObjectNavigationResult {
  navigated: boolean;
  message?: string;
}

const OPERATOR_SUPPORTED_ACTIONS = new Set<TaskLinkedObjectActionType>([
  'OPEN_VEHICLE',
  'OPEN_BOOKING',
]);

const ACTION_BLOCKED_IN_OPERATOR: Partial<Record<TaskLinkedObjectActionType, string>> = {
  OPEN_CUSTOMER: 'Kundendetails sind im Operator-Bereich nicht verfügbar.',
  OPEN_INVOICE: 'Rechnungen können im Operator-Bereich nicht geöffnet werden.',
  OPEN_DOCUMENT: 'Dokumente können im Operator-Bereich nicht geöffnet werden.',
  OPEN_ALERT: 'Hinweise sind im Operator-Bereich nicht verfügbar.',
  OPEN_SERVICE_CASE: 'Servicefälle sind im Operator-Bereich nicht verfügbar.',
  OPEN_FINE: 'Bußgelder sind im Operator-Bereich nicht verfügbar.',
  OPEN_VENDOR: 'Partnerdetails sind im Operator-Bereich nicht verfügbar.',
};

export function isOperatorLinkedObjectActionSupported(actionType: TaskLinkedObjectActionType): boolean {
  return OPERATOR_SUPPORTED_ACTIONS.has(actionType);
}

export function navigateTaskLinkedObject(
  object: TaskDetailLinkedObjectModel,
  handlers: TaskLinkedObjectNavigationHandlers,
  options?: { taskVehicleId?: string | null },
): TaskLinkedObjectNavigationResult {
  if (!object.isAvailable) {
    const message =
      object.unavailableReason ??
      'Das verknüpfte Objekt ist nicht mehr verfügbar.';
    handlers.onBlocked?.(message);
    return { navigated: false, message };
  }

  const action = object.raw.action;
  if (handlers.surface === 'operator' && !isOperatorLinkedObjectActionSupported(action.type)) {
    const message =
      ACTION_BLOCKED_IN_OPERATOR[action.type] ??
      'Dieses Objekt kann im Operator-Bereich nicht geöffnet werden.';
    handlers.onBlocked?.(message);
    return { navigated: false, message };
  }

  switch (action.type) {
    case 'OPEN_VEHICLE':
      if (!action.vehicleId || !handlers.openVehicle) {
        return blocked(handlers, 'Fahrzeugnavigation ist nicht verfügbar.');
      }
      handlers.openVehicle(action.vehicleId);
      return { navigated: true };

    case 'OPEN_BOOKING':
      if (!action.bookingId || !handlers.openBooking) {
        return blocked(handlers, 'Buchungsnavigation ist nicht verfügbar.');
      }
      handlers.openBooking(action.bookingId);
      return { navigated: true };

    case 'OPEN_CUSTOMER':
      if (!action.customerId || !handlers.openCustomer) {
        return blocked(handlers, 'Kundennavigation ist nicht verfügbar.');
      }
      handlers.openCustomer(action.customerId);
      return { navigated: true };

    case 'OPEN_INVOICE':
      if (!action.invoiceId || !handlers.openInvoice) {
        return blocked(handlers, 'Rechnungsnavigation ist nicht verfügbar.');
      }
      handlers.openInvoice(action.invoiceId);
      return { navigated: true };

    case 'OPEN_DOCUMENT':
      if (!action.documentId || !handlers.openDocument) {
        return blocked(handlers, 'Dokumentnavigation ist nicht verfügbar.');
      }
      handlers.openDocument(action.documentId, {
        vehicleId: options?.taskVehicleId ?? null,
        module: action.module ?? null,
      });
      return { navigated: true };

    case 'OPEN_ALERT':
      if (!action.alertId || !handlers.openAlert) {
        return blocked(handlers, 'Hinweisnavigation ist nicht verfügbar.');
      }
      handlers.openAlert(action.alertId, {
        vehicleId: options?.taskVehicleId ?? null,
      });
      return { navigated: true };

    case 'OPEN_SERVICE_CASE':
      if (!action.serviceCaseId || !handlers.openServiceCase) {
        return blocked(handlers, 'Servicefallnavigation ist nicht verfügbar.');
      }
      handlers.openServiceCase(action.serviceCaseId, {
        vehicleId: options?.taskVehicleId ?? null,
      });
      return { navigated: true };

    case 'OPEN_FINE':
      if (!action.fineId || !handlers.openFine) {
        return blocked(handlers, 'Bußgeldnavigation ist nicht verfügbar.');
      }
      handlers.openFine(action.fineId);
      return { navigated: true };

    case 'OPEN_VENDOR':
      if (!action.vendorId || !handlers.openVendor) {
        return blocked(handlers, 'Partnernavigation ist nicht verfügbar.');
      }
      handlers.openVendor(action.vendorId);
      return { navigated: true };

    default:
      return blocked(handlers, 'Navigation für dieses Objekt ist nicht konfiguriert.');
  }
}

function blocked(
  handlers: TaskLinkedObjectNavigationHandlers,
  message: string,
): TaskLinkedObjectNavigationResult {
  handlers.onBlocked?.(message);
  return { navigated: false, message };
}