import type { Booking, BookingStatus, BookingStatusCommandType } from '@prisma/client';
import type { BookingStatusTrigger } from '../state-machine/booking-state-machine.types';

export const BOOKING_STATUS_COMMAND_TYPES = [
  'CONFIRM',
  'ACTIVATE',
  'COMPLETE',
  'CANCEL',
  'MARK_NO_SHOW',
  'ADMIN_OVERRIDE',
] as const;

export type BookingStatusCommandKind = (typeof BOOKING_STATUS_COMMAND_TYPES)[number];

export const COMMAND_TO_TRIGGER: Record<
  Exclude<BookingStatusCommandKind, 'ADMIN_OVERRIDE'>,
  BookingStatusTrigger
> = {
  CONFIRM: 'confirm',
  ACTIVATE: 'pickup_handover',
  COMPLETE: 'return_handover',
  CANCEL: 'cancel',
  MARK_NO_SHOW: 'mark_no_show',
};

export const COMMAND_TO_TARGET_STATUS: Record<
  Exclude<BookingStatusCommandKind, 'ADMIN_OVERRIDE'>,
  BookingStatus
> = {
  CONFIRM: 'CONFIRMED',
  ACTIVATE: 'ACTIVE',
  COMPLETE: 'COMPLETED',
  CANCEL: 'CANCELLED',
  MARK_NO_SHOW: 'NO_SHOW',
};

export interface BookingStatusCommandActor {
  userId?: string | null;
  displayName?: string | null;
}

export interface BookingStatusCommandTransitionMeta {
  command: BookingStatusCommandType;
  from: BookingStatus | null;
  to: BookingStatus;
  trigger: BookingStatusTrigger | 'admin_override';
  reasonCode: string;
  idempotent: boolean;
  replayed: boolean;
}

export interface BookingStatusCommandResult {
  booking: Booking;
  transition: BookingStatusCommandTransitionMeta;
}

export interface ExecuteBookingStatusCommandInput {
  organizationId: string;
  bookingId: string;
  command: BookingStatusCommandKind;
  idempotencyKey: string;
  actor: BookingStatusCommandActor;
  reason?: string | null;
  override?: {
    toStatus: BookingStatus;
    reason: string;
    hasPermission: boolean;
  };
  skipSideEffects?: boolean;
}
