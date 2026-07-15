/**
 * Canonical linked-object descriptors for task detail responses.
 * Mirrors the notification action-target pattern — entity IDs only, no frontend URLs.
 */

export type TaskLinkedObjectType =
  | 'VEHICLE'
  | 'BOOKING'
  | 'CUSTOMER'
  | 'INVOICE'
  | 'DOCUMENT'
  | 'ALERT'
  | 'SERVICE_CASE'
  | 'FINE'
  | 'VENDOR';

export enum TaskLinkedObjectActionType {
  OPEN_VEHICLE = 'OPEN_VEHICLE',
  OPEN_BOOKING = 'OPEN_BOOKING',
  OPEN_CUSTOMER = 'OPEN_CUSTOMER',
  OPEN_INVOICE = 'OPEN_INVOICE',
  OPEN_DOCUMENT = 'OPEN_DOCUMENT',
  OPEN_ALERT = 'OPEN_ALERT',
  OPEN_SERVICE_CASE = 'OPEN_SERVICE_CASE',
  OPEN_FINE = 'OPEN_FINE',
  OPEN_VENDOR = 'OPEN_VENDOR',
}

export interface TaskLinkedObjectActionDescriptor {
  type: TaskLinkedObjectActionType;
  vehicleId?: string;
  bookingId?: string;
  customerId?: string;
  invoiceId?: string;
  documentId?: string;
  alertId?: string;
  serviceCaseId?: string;
  fineId?: string;
  vendorId?: string;
  module?: string;
}

export interface TaskLinkedObject {
  type: TaskLinkedObjectType;
  id: string;
  primaryLabel: string;
  secondaryLabel?: string | null;
  statusLabel?: string | null;
  iconKey: string;
  action: TaskLinkedObjectActionDescriptor;
  isAvailable: boolean;
  unavailableReason?: string | null;
}

export interface TaskLinkIds {
  vehicleId?: string | null;
  bookingId?: string | null;
  customerId?: string | null;
  vendorId?: string | null;
  alertId?: string | null;
  documentId?: string | null;
  fineId?: string | null;
  invoiceId?: string | null;
  serviceCaseId?: string | null;
}

export const TASK_LINKED_OBJECT_ORDER: TaskLinkedObjectType[] = [
  'VEHICLE',
  'BOOKING',
  'CUSTOMER',
  'SERVICE_CASE',
  'INVOICE',
  'DOCUMENT',
  'FINE',
  'VENDOR',
  'ALERT',
];

export const TASK_LINKED_OBJECT_ICON_KEYS: Record<TaskLinkedObjectType, string> = {
  VEHICLE: 'vehicle',
  BOOKING: 'booking',
  CUSTOMER: 'customer',
  INVOICE: 'invoice',
  DOCUMENT: 'document',
  ALERT: 'alert',
  SERVICE_CASE: 'service-case',
  FINE: 'fine',
  VENDOR: 'vendor',
};

export const TASK_LINKED_OBJECT_UNAVAILABLE: Record<TaskLinkedObjectType, string> = {
  VEHICLE: 'Fahrzeug nicht verfügbar',
  BOOKING: 'Buchung nicht verfügbar',
  CUSTOMER: 'Kunde nicht verfügbar',
  INVOICE: 'Rechnung nicht verfügbar',
  DOCUMENT: 'Dokument nicht verfügbar',
  ALERT: 'Hinweis nicht verfügbar',
  SERVICE_CASE: 'Servicefall nicht verfügbar',
  FINE: 'Bußgeld nicht verfügbar',
  VENDOR: 'Partner nicht verfügbar',
};

export const TASK_LINKED_OBJECT_UNAVAILABLE_REASON =
  'Das verknüpfte Objekt wurde gelöscht oder ist in dieser Organisation nicht mehr zugänglich.';
