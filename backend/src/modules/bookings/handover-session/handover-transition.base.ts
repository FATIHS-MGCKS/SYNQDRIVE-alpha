import { resolveHandoverStatusTransition } from '../booking-lifecycle-status.matrix';
import { HANDOVER_SESSION_ERROR } from './handover-session.errors';
import {
  isHandoverSessionTerminalStatus,
  isTransitionAllowedInMatrix,
} from './handover-session-transition.matrix';
import {
  HANDOVER_SESSION_NOT_STARTED,
  type HandoverTransitionDecision,
  type HandoverTransitionEvaluateInput,
} from './handover-session.types';

const VEHICLE_BLOCKED_STATUSES = new Set(['IN_SERVICE', 'OUT_OF_SERVICE']);
const BOOKING_TERMINAL = new Set(['COMPLETED', 'CANCELLED', 'NO_SHOW']);

export function denyHandoverTransition(
  code: string,
  reason: string,
  blockers?: HandoverTransitionDecision['blockers'],
): HandoverTransitionDecision {
  return { allowed: false, code, reason, blockers };
}

export function allowHandoverTransition(): HandoverTransitionDecision {
  return { allowed: true };
}

/**
 * Shared pickup/return transition rules — booking, vehicle, scope, version, permissions.
 */
export function evaluateHandoverTransitionBase(
  input: HandoverTransitionEvaluateInput,
): HandoverTransitionDecision {
  const { fromStatus, toStatus, action, kind } = input;

  if (!isTransitionAllowedInMatrix(fromStatus, toStatus)) {
    return denyHandoverTransition(
      HANDOVER_SESSION_ERROR.TRANSITION_FORBIDDEN,
      `Transition ${fromStatus} → ${toStatus} is not allowed`,
    );
  }

  if (
    fromStatus !== HANDOVER_SESSION_NOT_STARTED &&
    isHandoverSessionTerminalStatus(fromStatus) &&
    !(fromStatus === 'COMPLETED' && action === 'SUPERSEDE' && toStatus === 'SUPERSEDED')
  ) {
    return denyHandoverTransition(
      HANDOVER_SESSION_ERROR.TERMINAL_IMMUTABLE,
      `Terminal session status ${fromStatus} cannot transition`,
    );
  }

  if (BOOKING_TERMINAL.has(input.booking.status)) {
    return denyHandoverTransition(
      HANDOVER_SESSION_ERROR.BOOKING_TERMINAL,
      `Booking is terminal (${input.booking.status})`,
    );
  }

  const lifecycleDecision = resolveHandoverStatusTransition(
    kind,
    input.booking.status as never,
  );
  if (!lifecycleDecision.allowed && action === 'START') {
    return denyHandoverTransition(
      HANDOVER_SESSION_ERROR.BOOKING_WRONG_STATUS,
      lifecycleDecision.reason ?? `Booking status ${input.booking.status} invalid for ${kind}`,
    );
  }

  if (input.existingCompletedProtocolId && action !== 'SUPERSEDE') {
    return denyHandoverTransition(
      HANDOVER_SESSION_ERROR.PROTOCOL_ALREADY_EXISTS,
      'Completed handover protocol already exists for this booking side',
    );
  }

  if (
    input.expectedVersion != null &&
    input.currentVersion != null &&
    input.expectedVersion !== input.currentVersion
  ) {
    return denyHandoverTransition(
      HANDOVER_SESSION_ERROR.VERSION_CONFLICT,
      `Expected version ${input.expectedVersion} but current is ${input.currentVersion}`,
    );
  }

  if (
    input.lockedByUserId &&
    input.lockedByUserId !== input.actor.userId &&
    toStatus === 'IN_PROGRESS'
  ) {
    return denyHandoverTransition(
      HANDOVER_SESSION_ERROR.LOCK_CONFLICT,
      'Session is locked by another user',
    );
  }

  if (!input.permissions.canWriteBookings) {
    return denyHandoverTransition(
      HANDOVER_SESSION_ERROR.PERMISSION_DENIED,
      'Missing bookings.write permission',
    );
  }

  if (!input.scope.stationWritable) {
    if (!input.scopeOverrideReason?.trim()) {
      return denyHandoverTransition(
        HANDOVER_SESSION_ERROR.SCOPE_OVERRIDE_REQUIRED,
        'Station scope override reason required',
        [
          {
            code: HANDOVER_SESSION_ERROR.SCOPE_DENIED,
            message: 'Booking or station outside writable scope',
            overridable: true,
            category: 'scope',
          },
        ],
      );
    }
    if (!input.permissions.canOverrideScope) {
      return denyHandoverTransition(
        HANDOVER_SESSION_ERROR.PERMISSION_DENIED,
        'Missing operator.handover.override permission for scope override',
      );
    }
  }

  if (kind === 'PICKUP' && input.vehicle && VEHICLE_BLOCKED_STATUSES.has(input.vehicle.status)) {
    return denyHandoverTransition(
      HANDOVER_SESSION_ERROR.VEHICLE_BLOCKED,
      `Vehicle status ${input.vehicle.status} blocks pickup handover`,
    );
  }

  if (kind === 'PICKUP' && input.vehicle?.rentalBlocked) {
    return denyHandoverTransition(
      HANDOVER_SESSION_ERROR.VEHICLE_RENTAL_BLOCKED,
      input.vehicle.blockingReasons.join(' · ') || 'Vehicle rental_blocked',
    );
  }

  if (action === 'CANCEL') {
    if (!input.cancelReason?.trim()) {
      return denyHandoverTransition(
        HANDOVER_SESSION_ERROR.CANCEL_REASON_REQUIRED,
        'Cancel reason is required',
      );
    }
    return allowHandoverTransition();
  }

  if (action === 'SUPERSEDE') {
    if (!input.supersedeReason?.trim()) {
      return denyHandoverTransition(
        HANDOVER_SESSION_ERROR.SUPERSEDE_REASON_REQUIRED,
        'Supersede reason is required',
      );
    }
    if (!input.permissions.canSupersede) {
      return denyHandoverTransition(
        HANDOVER_SESSION_ERROR.PERMISSION_DENIED,
        'Missing supersede permission',
      );
    }
    return allowHandoverTransition();
  }

  if (action === 'COMPLETE') {
    return denyHandoverTransition(
      HANDOVER_SESSION_ERROR.COMPLETE_NOT_IMPLEMENTED,
      'Session completion transaction is not available in this release — use legacy handover POST',
    );
  }

  return allowHandoverTransition();
}
