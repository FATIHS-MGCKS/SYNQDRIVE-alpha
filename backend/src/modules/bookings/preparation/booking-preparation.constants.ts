export const BOOKING_PREPARATION_ARTIFACT_TYPES = {
  PRICING: 'PRICING',
  INVOICE: 'INVOICE',
  PAYMENT: 'PAYMENT',
  LEGAL_DOCUMENTS: 'LEGAL_DOCUMENTS',
  RENTAL_AGREEMENT: 'RENTAL_AGREEMENT',
  PICKUP_TASK: 'PICKUP_TASK',
  RETURN_TASK: 'RETURN_TASK',
  CUSTOMER_EMAIL: 'CUSTOMER_EMAIL',
  INTERNAL_NOTIFICATION: 'INTERNAL_NOTIFICATION',
} as const;

export type BookingPreparationArtifactType =
  (typeof BOOKING_PREPARATION_ARTIFACT_TYPES)[keyof typeof BOOKING_PREPARATION_ARTIFACT_TYPES];

export const BOOKING_PREPARATION_ARTIFACT_STATUSES = {
  NOT_REQUIRED: 'NOT_REQUIRED',
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  READY: 'READY',
  FAILED: 'FAILED',
  RETRY_SCHEDULED: 'RETRY_SCHEDULED',
} as const;

export type BookingPreparationArtifactStatus =
  (typeof BOOKING_PREPARATION_ARTIFACT_STATUSES)[keyof typeof BOOKING_PREPARATION_ARTIFACT_STATUSES];

export const BOOKING_PREPARATION_RECOVERY_ACTIONS = {
  RETRY_INVOICE: 'RETRY_INVOICE',
  RETRY_DOCUMENT: 'RETRY_DOCUMENT',
  RETRY_EMAIL: 'RETRY_EMAIL',
  REBUILD_TASKS: 'REBUILD_TASKS',
} as const;

export type BookingPreparationRecoveryAction =
  (typeof BOOKING_PREPARATION_RECOVERY_ACTIONS)[keyof typeof BOOKING_PREPARATION_RECOVERY_ACTIONS];

export const BOOKING_PREPARATION_ARTIFACT_LABELS_DE: Record<BookingPreparationArtifactType, string> = {
  PRICING: 'Preisberechnung',
  INVOICE: 'Rechnung',
  PAYMENT: 'Zahlung',
  LEGAL_DOCUMENTS: 'Rechtliche Dokumente',
  RENTAL_AGREEMENT: 'Mietvertrag',
  PICKUP_TASK: 'Pickup-Aufgabe',
  RETURN_TASK: 'Rückgabe-Aufgabe',
  CUSTOMER_EMAIL: 'Kunden-E-Mail',
  INTERNAL_NOTIFICATION: 'Interne Benachrichtigung',
};

/** Artifacts that must be READY before pickup when required. */
export const BOOKING_PREPARATION_PICKUP_BLOCKING_ARTIFACTS = new Set<BookingPreparationArtifactType>([
  BOOKING_PREPARATION_ARTIFACT_TYPES.INVOICE,
  BOOKING_PREPARATION_ARTIFACT_TYPES.LEGAL_DOCUMENTS,
  BOOKING_PREPARATION_ARTIFACT_TYPES.RENTAL_AGREEMENT,
]);

export const BOOKING_PREPARATION_ALL_ARTIFACT_TYPES = Object.values(
  BOOKING_PREPARATION_ARTIFACT_TYPES,
) as BookingPreparationArtifactType[];

export function buildBookingPreparationRecoveryIdempotencyKey(parts: string[]): string {
  return ['booking-prep-recovery', ...parts.filter(Boolean)].join(':');
}
