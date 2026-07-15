import type { TaskAutomationEntityType } from '@prisma/client';

/** Stable operation codes stored in outbox payload — reload entity state from DB on retry. */
export type TaskAutomationOperation =
  | 'ENSURE_BOOKING_LIFECYCLE'
  | 'SYNC_BOOKING_PREPARATION'
  | 'SYNC_BOOKING_PICKUP'
  | 'SYNC_BOOKING_RETURN'
  | 'SUPERSEDE_BOOKING_LIFECYCLE'
  | 'HANDLE_BOOKING_NO_SHOW'
  | 'ON_PICKUP_HANDOVER_COMPLETED'
  | 'ON_RETURN_HANDOVER_COMPLETED'
  | 'SYNC_DOCUMENT_PACKAGES'
  | 'SUPERSEDE_DOCUMENT_PACKAGES'
  | 'CLOSE_STALE_DOCUMENT_PACKAGES'
  | 'SYNC_INVOICE_PAYMENT_CHECK'
  | 'MATERIALIZE_INSIGHT_TASK'
  | 'SYNC_VEHICLE_CLEANING_BOOKING'
  | 'VEHICLE_CLEANING_ON_CANCEL'
  | 'VEHICLE_CLEANING_ON_VEHICLE_CHANGE'
  | 'ENSURE_REPAIR_TASK';

/** Non-sensitive payload — IDs and operational hints only (no PII). */
export interface TaskAutomationOutboxPayload {
  operation: TaskAutomationOperation;
  bookingId?: string;
  invoiceId?: string;
  vehicleId?: string;
  vendorId?: string;
  dedupKey?: string;
  phase?: string;
  previousStartDate?: string;
  previousEndDate?: string;
  previousVehicleId?: string;
  insightDedupKey?: string;
  insightType?: string;
  repairReason?: string;
}

export interface TaskAutomationOutboxMeta {
  organizationId: string;
  ruleId: string;
  ruleVersion: number;
  entityType: TaskAutomationEntityType;
  entityId: string;
  idempotencyKey: string;
  payload: TaskAutomationOutboxPayload;
}
