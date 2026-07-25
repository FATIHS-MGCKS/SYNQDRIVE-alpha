import { HANDOVER_SESSION_ERROR } from './handover-session.errors';
import {
  allowHandoverTransition,
  denyHandoverTransition,
  evaluateHandoverTransitionBase,
} from './handover-transition.base';
import type {
  HandoverTransitionDecision,
  HandoverTransitionEvaluateInput,
} from './handover-session.types';

function hasCustomerSignature(payload: HandoverTransitionEvaluateInput['payload']): boolean {
  return Boolean(
    payload.customerSignatureDataUrl?.trim() || payload.customerSignatureName?.trim(),
  );
}

function hasStaffSignature(payload: HandoverTransitionEvaluateInput['payload']): boolean {
  return Boolean(
    payload.staffSignatureDataUrl?.trim() || payload.staffSignatureName?.trim(),
  );
}

/** Return-specific transition policy. */
export function evaluateReturnTransitionPolicy(
  input: HandoverTransitionEvaluateInput,
): HandoverTransitionDecision {
  const base = evaluateHandoverTransitionBase(input);
  if (!base.allowed) return base;

  if (!input.booking.hasPickupProtocol) {
    return denyHandoverTransition(
      HANDOVER_SESSION_ERROR.PICKUP_PROTOCOL_REQUIRED,
      'Return handover requires an existing pickup protocol',
    );
  }

  if (input.booking.status !== 'ACTIVE') {
    return denyHandoverTransition(
      HANDOVER_SESSION_ERROR.BOOKING_WRONG_STATUS,
      `Return requires ACTIVE booking, got ${input.booking.status}`,
    );
  }

  const hardBlockers = input.requirements.blockers.filter((b) => !b.overridable);
  if (hardBlockers.length > 0 && input.toStatus !== 'AWAITING_REQUIREMENTS') {
    return denyHandoverTransition(
      HANDOVER_SESSION_ERROR.GATE_BLOCKED,
      hardBlockers.map((b) => b.message).join(' · '),
      hardBlockers,
    );
  }

  if (
    (input.toStatus === 'AWAITING_SIGNATURE' || input.action === 'SYNC_SIGNATURES') &&
    (!hasCustomerSignature(input.payload) || !hasStaffSignature(input.payload))
  ) {
    return allowHandoverTransition();
  }

  if (input.toStatus === 'SUBMITTED' || input.action === 'SUBMIT') {
    if (!hasCustomerSignature(input.payload) || !hasStaffSignature(input.payload)) {
      return denyHandoverTransition(
        HANDOVER_SESSION_ERROR.SIGNATURE_REQUIRED,
        'Customer and staff signatures required before submit',
      );
    }
    if (input.payload.odometerKm == null || input.payload.odometerKm < 0) {
      return denyHandoverTransition(
        HANDOVER_SESSION_ERROR.TRANSITION_FORBIDDEN,
        'Odometer reading required before submit',
      );
    }
  }

  return allowHandoverTransition();
}
