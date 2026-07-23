import { ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import type { BookingStatus } from '@prisma/client';
import {
  BOOKING_TERMINAL_STATUSES,
  BOOKING_TRANSITION_LOOKUP,
  transitionLookupKey,
} from './booking-state-machine.constants';
import { BOOKING_STATE_MACHINE_ERROR_CODES } from './booking-state-machine-error.codes';
import type {
  AssertBookingTransitionInput,
  BookingStatusTransitionDefinition,
  BookingStatusTrigger,
  BookingTransitionPreconditionContext,
} from './booking-state-machine.types';

export function isTerminalBookingStatus(status: BookingStatus): boolean {
  return (BOOKING_TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function findTransition(
  from: BookingStatus | null,
  to: BookingStatus,
  trigger: BookingStatusTrigger,
): BookingStatusTransitionDefinition | undefined {
  return BOOKING_TRANSITION_LOOKUP.get(transitionLookupKey(from, to, trigger));
}

export function assertPreconditions(
  definition: BookingStatusTransitionDefinition,
  context: BookingTransitionPreconditionContext,
): void {
  const now = context.now ?? new Date();

  if (definition.key === 'mark_no_show') {
    const start = context.scheduledStartDate;
    if (!start || start.getTime() > now.getTime()) {
      throw new BadRequestException({
        message:
          'Buchung kann erst nach dem geplanten Pickup-Zeitpunkt als No-Show markiert werden.',
        code: BOOKING_STATE_MACHINE_ERROR_CODES.NO_SHOW_TOO_EARLY,
        scheduledStart: start?.toISOString() ?? null,
      });
    }
  }
}

/**
 * Resolves whether a status transition is allowed and returns its definition.
 * Admin override is a separate, explicit path — never implicit.
 */
export function resolveBookingStatusTransition(
  input: AssertBookingTransitionInput,
): BookingStatusTransitionDefinition {
  const { from, to, trigger, preconditions = {}, override } = input;

  if (from !== null && from === to) {
    throw new ConflictException({
      message: 'Booking status unchanged',
      code: BOOKING_STATE_MACHINE_ERROR_CODES.TRANSITION_NOT_ALLOWED,
      from,
      to,
      trigger,
    });
  }

  const definition = findTransition(from, to, trigger);
  if (definition) {
    assertPreconditions(definition, preconditions);
    return definition;
  }

  if (override && from !== null) {
    return resolveOverrideTransition(from, to, trigger, override);
  }

  if (from !== null && isTerminalBookingStatus(from) && !isTerminalBookingStatus(to)) {
    throw new ConflictException({
      message: `Terminal booking status ${from} cannot be reactivated without admin override`,
      code: BOOKING_STATE_MACHINE_ERROR_CODES.TERMINAL_REACTIVATION_FORBIDDEN,
      from,
      to,
      trigger,
    });
  }

  throw new ConflictException({
    message: `Status transition ${from ?? '∅'} → ${to} via ${trigger} is not allowed`,
    code: BOOKING_STATE_MACHINE_ERROR_CODES.TRANSITION_NOT_ALLOWED,
    from,
    to,
    trigger,
  });
}

function resolveOverrideTransition(
  from: BookingStatus,
  to: BookingStatus,
  trigger: BookingStatusTrigger,
  override: NonNullable<AssertBookingTransitionInput['override']>,
): BookingStatusTransitionDefinition {
  const reason = override.reason?.trim();
  if (!reason || reason.length < 10) {
    throw new BadRequestException({
      message: 'Admin override requires a reason (min 10 characters)',
      code: BOOKING_STATE_MACHINE_ERROR_CODES.OVERRIDE_REASON_REQUIRED,
    });
  }
  if (!override.hasPermission) {
    throw new ForbiddenException({
      message: 'Missing booking.override permission for status transition',
      code: BOOKING_STATE_MACHINE_ERROR_CODES.OVERRIDE_DENIED,
    });
  }

  return {
    key: 'mark_no_show',
    from,
    to,
    trigger: 'admin_override',
    permission: 'booking.override',
    reasonCode: 'BOOKING_STATUS_ADMIN_OVERRIDE',
    terminal: isTerminalBookingStatus(to),
    workflowEventType: 'booking.status_overridden',
  };
}

/** Enumerate all legal transitions for tests and documentation. */
export function listAllowedBookingTransitions(): BookingStatusTransitionDefinition[] {
  return [...BOOKING_TRANSITION_LOOKUP.values()];
}
