import type { BookingStatus } from '@prisma/client';
import type {
  BookingStatusTransitionDefinition,
  BookingStatusTransitionKey,
} from './booking-state-machine.types';

export const BOOKING_TERMINAL_STATUSES: readonly BookingStatus[] = [
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;

export const BOOKING_LIFECYCLE_STATUSES: readonly BookingStatus[] = [
  'PENDING',
  'CONFIRMED',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;

/**
 * Explicit, closed transition table. Anything not listed is forbidden.
 * Orthogonal concerns (payment, preparation, wizard draft) use separate fields —
 * not additional BookingStatus values.
 */
export const BOOKING_STATUS_TRANSITIONS: Record<
  BookingStatusTransitionKey,
  BookingStatusTransitionDefinition
> = {
  create_pending: {
    key: 'create_pending',
    from: null,
    to: 'PENDING',
    trigger: 'create',
    permission: 'booking.create',
    reasonCode: 'BOOKING_CREATED_PENDING',
    terminal: false,
  },
  create_confirmed: {
    key: 'create_confirmed',
    from: null,
    to: 'CONFIRMED',
    trigger: 'create',
    permission: 'booking.create',
    workflowEventType: 'booking.confirmed',
    reasonCode: 'BOOKING_CREATED_CONFIRMED',
    terminal: false,
  },
  confirm: {
    key: 'confirm',
    from: 'PENDING',
    to: 'CONFIRMED',
    trigger: 'confirm',
    permission: 'booking.confirm',
    workflowEventType: 'booking.confirmed',
    reasonCode: 'BOOKING_CONFIRMED',
    terminal: false,
  },
  cancel_from_pending: {
    key: 'cancel_from_pending',
    from: 'PENDING',
    to: 'CANCELLED',
    trigger: 'cancel',
    permission: 'booking.cancel',
    workflowEventType: 'booking.cancelled',
    reasonCode: 'BOOKING_CANCELLED',
    terminal: true,
  },
  cancel_from_confirmed: {
    key: 'cancel_from_confirmed',
    from: 'CONFIRMED',
    to: 'CANCELLED',
    trigger: 'cancel',
    permission: 'booking.cancel',
    workflowEventType: 'booking.cancelled',
    reasonCode: 'BOOKING_CANCELLED',
    terminal: true,
  },
  cancel_from_active: {
    key: 'cancel_from_active',
    from: 'ACTIVE',
    to: 'CANCELLED',
    trigger: 'cancel',
    permission: 'booking.cancel',
    workflowEventType: 'booking.cancelled',
    reasonCode: 'BOOKING_CANCELLED_ACTIVE',
    terminal: true,
  },
  pickup_handover: {
    key: 'pickup_handover',
    from: 'CONFIRMED',
    to: 'ACTIVE',
    trigger: 'pickup_handover',
    permission: 'booking.handover.perform',
    workflowEventType: 'booking.activated',
    reasonCode: 'BOOKING_PICKUP_COMPLETED',
    terminal: false,
  },
  return_handover: {
    key: 'return_handover',
    from: 'ACTIVE',
    to: 'COMPLETED',
    trigger: 'return_handover',
    permission: 'booking.handover.perform',
    workflowEventType: 'booking.completed',
    reasonCode: 'BOOKING_RETURN_COMPLETED',
    terminal: true,
  },
  mark_no_show: {
    key: 'mark_no_show',
    from: 'CONFIRMED',
    to: 'NO_SHOW',
    trigger: 'mark_no_show',
    permission: 'booking.mark_no_show',
    workflowEventType: 'booking.no_show',
    reasonCode: 'BOOKING_NO_SHOW',
    terminal: true,
  },
};

/** Lookup index: `${from ?? 'null'}:${to}:${trigger}` */
export function transitionLookupKey(
  from: BookingStatus | null,
  to: BookingStatus,
  trigger: string,
): string {
  return `${from ?? 'null'}:${to}:${trigger}`;
}

export const BOOKING_TRANSITION_LOOKUP: ReadonlyMap<string, BookingStatusTransitionDefinition> =
  new Map(
    Object.values(BOOKING_STATUS_TRANSITIONS).map((def) => [
      transitionLookupKey(def.from, def.to, def.trigger),
      def,
    ]),
  );
