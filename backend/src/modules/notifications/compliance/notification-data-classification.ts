/**
 * GDPR data categories for notification engine artefacts.
 * Aligned with SynqDrive domain model — not arbitrary taxonomy.
 */
export const NOTIFICATION_DATA_CATEGORY = {
  MASTER_DATA: 'MASTER_DATA',
  VEHICLE_DATA: 'VEHICLE_DATA',
  LOCATION_DATA: 'LOCATION_DATA',
  BOOKING_DATA: 'BOOKING_DATA',
  CUSTOMER_DATA: 'CUSTOMER_DATA',
  TECHNICAL_DATA: 'TECHNICAL_DATA',
  COMMUNICATION_DATA: 'COMMUNICATION_DATA',
  AUDIT_DATA: 'AUDIT_DATA',
} as const;

export type NotificationDataCategory =
  (typeof NOTIFICATION_DATA_CATEGORY)[keyof typeof NOTIFICATION_DATA_CATEGORY];

export interface NotificationFieldClassification {
  field: string;
  category: NotificationDataCategory;
  containsPii: boolean;
  notes?: string;
}

/** Stored Notification columns — classification reference for DSAR/retention. */
export const NOTIFICATION_FIELD_CLASSIFICATIONS: NotificationFieldClassification[] = [
  { field: 'id', category: 'TECHNICAL_DATA', containsPii: false },
  { field: 'organizationId', category: 'MASTER_DATA', containsPii: false },
  { field: 'fingerprint', category: 'TECHNICAL_DATA', containsPii: false },
  { field: 'eventType', category: 'TECHNICAL_DATA', containsPii: false },
  { field: 'entityType', category: 'TECHNICAL_DATA', containsPii: false },
  { field: 'entityId', category: 'TECHNICAL_DATA', containsPii: false, notes: 'Indirect identifier via FK' },
  { field: 'templateParams', category: 'COMMUNICATION_DATA', containsPii: true },
  { field: 'actionTarget', category: 'BOOKING_DATA', containsPii: true, notes: 'May reference customer/booking IDs' },
  { field: 'titleKey', category: 'COMMUNICATION_DATA', containsPii: false },
  { field: 'bodyKey', category: 'COMMUNICATION_DATA', containsPii: false },
  { field: 'primarySourceRef', category: 'AUDIT_DATA', containsPii: false },
];

/** templateParams / metadata keys → category. */
export const NOTIFICATION_PARAM_CLASSIFICATION: Record<string, NotificationDataCategory> = {
  label: 'VEHICLE_DATA',
  plate: 'VEHICLE_DATA',
  vin: 'VEHICLE_DATA',
  licensePlate: 'VEHICLE_DATA',
  vehicleId: 'VEHICLE_DATA',
  stationName: 'LOCATION_DATA',
  stationId: 'LOCATION_DATA',
  bookingRef: 'BOOKING_DATA',
  bookingId: 'BOOKING_DATA',
  invoiceRef: 'BOOKING_DATA',
  invoiceId: 'BOOKING_DATA',
  customerId: 'CUSTOMER_DATA',
  customerName: 'CUSTOMER_DATA',
  customerEmail: 'CUSTOMER_DATA',
  customerPhone: 'CUSTOMER_DATA',
  amount: 'CUSTOMER_DATA',
  amountCents: 'CUSTOMER_DATA',
  integrationName: 'TECHNICAL_DATA',
  webhookName: 'TECHNICAL_DATA',
  apiKeyHint: 'TECHNICAL_DATA',
  runId: 'AUDIT_DATA',
  adapterId: 'AUDIT_DATA',
  reason: 'AUDIT_DATA',
};

/** Keys never persisted in notification templateParams / occurrence payload. */
export const NOTIFICATION_BLOCKED_STORAGE_KEYS = new Set([
  'customerName',
  'customerEmail',
  'customerPhone',
  'vin',
  'licensePlate',
  'apiKeyHint',
  'webhookSecret',
  'amount',
  'amountCents',
  'depositAmount',
  'balanceDue',
  'iban',
  'bic',
  'creditCard',
  'cvv',
  'ssn',
  'taxId',
  'signature',
  'transcript',
  'messageBody',
  'rawPayload',
]);

export function classifyParamKey(key: string): NotificationDataCategory {
  return NOTIFICATION_PARAM_CLASSIFICATION[key] ?? 'TECHNICAL_DATA';
}
