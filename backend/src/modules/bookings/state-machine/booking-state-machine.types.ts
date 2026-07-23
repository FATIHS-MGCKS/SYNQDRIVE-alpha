import type { BookingStatus } from '@prisma/client';
import type { BookingPermissionAction } from '../booking-permission.constants';

/** Canonical triggers that may cause a booking status transition. */
export const BOOKING_STATUS_TRIGGERS = [
  'create',
  'confirm',
  'cancel',
  'pickup_handover',
  'return_handover',
  'mark_no_show',
  'admin_override',
] as const;

export type BookingStatusTrigger = (typeof BOOKING_STATUS_TRIGGERS)[number];

export type BookingStatusTransitionKey =
  | 'create_pending'
  | 'create_confirmed'
  | 'confirm'
  | 'cancel_from_pending'
  | 'cancel_from_confirmed'
  | 'cancel_from_active'
  | 'pickup_handover'
  | 'return_handover'
  | 'mark_no_show';

export interface BookingStatusTransitionDefinition {
  key: BookingStatusTransitionKey;
  from: BookingStatus | null;
  to: BookingStatus;
  trigger: BookingStatusTrigger;
  permission: BookingPermissionAction;
  /** Workflow event type emitted after successful transition (if any). */
  workflowEventType?: string;
  /** Stable reason code stored in audit meta. */
  reasonCode: string;
  terminal: boolean;
}

export interface BookingTransitionPreconditionContext {
  scheduledStartDate?: Date;
  now?: Date;
}

export interface BookingTransitionActor {
  userId?: string | null;
  displayName?: string | null;
}

export interface BookingTransitionOverride {
  hasPermission: boolean;
  reason: string;
}

export interface AssertBookingTransitionInput {
  from: BookingStatus | null;
  to: BookingStatus;
  trigger: BookingStatusTrigger;
  preconditions?: BookingTransitionPreconditionContext;
  override?: BookingTransitionOverride;
}
