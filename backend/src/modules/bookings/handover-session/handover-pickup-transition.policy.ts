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

/** Pickup-specific transition policy — gate, eligibility, documents. */
export function evaluatePickupTransitionPolicy(
  input: HandoverTransitionEvaluateInput,
): HandoverTransitionDecision {
  const base = evaluateHandoverTransitionBase(input);
  if (!base.allowed) return base;

  const hardBlockers = input.requirements.blockers.filter((b) => !b.overridable);
  const softBlockers = input.requirements.blockers.filter((b) => b.overridable);

  if (input.toStatus === 'AWAITING_REQUIREMENTS' || input.action === 'SYNC_REQUIREMENTS') {
    if (hardBlockers.length > 0) {
      return denyHandoverTransition(
        HANDOVER_SESSION_ERROR.GATE_BLOCKED,
        hardBlockers.map((b) => b.message).join(' · '),
        hardBlockers,
      );
    }
    return allowHandoverTransition();
  }

  if (hardBlockers.length > 0) {
    return denyHandoverTransition(
      HANDOVER_SESSION_ERROR.GATE_BLOCKED,
      hardBlockers.map((b) => b.message).join(' · '),
      hardBlockers,
    );
  }

  if (softBlockers.length > 0) {
    const override = input.requirements.pickupGateOverrideReason?.trim();
    if (!override) {
      return denyHandoverTransition(
        HANDOVER_SESSION_ERROR.GATE_OVERRIDE_REQUIRED,
        'Pickup gate soft block — override reason required',
        softBlockers,
      );
    }
    if (!input.permissions.canOverridePickupGate) {
      return denyHandoverTransition(
        HANDOVER_SESSION_ERROR.GATE_OVERRIDE_DENIED,
        'Missing legal_documents.override_handover permission',
        softBlockers,
      );
    }
  }

  if (
    input.requirements.blockers.some((b) => b.category === 'eligibility') &&
    !input.requirements.eligibilityApprovalId
  ) {
    return denyHandoverTransition(
      HANDOVER_SESSION_ERROR.ELIGIBILITY_BLOCKED,
      'Customer eligibility blocks pickup',
      input.requirements.blockers.filter((b) => b.category === 'eligibility'),
    );
  }

  if (
    (input.toStatus === 'AWAITING_SIGNATURE' || input.action === 'SYNC_SIGNATURES') &&
    (!hasCustomerSignature(input.payload) || !hasStaffSignature(input.payload))
  ) {
    return allowHandoverTransition();
  }

  if (input.toStatus === 'SUBMITTED' || input.action === 'SUBMIT') {
    if (!input.payload.documentsAcknowledged) {
      return denyHandoverTransition(
        HANDOVER_SESSION_ERROR.DOCUMENTS_NOT_ACKNOWLEDGED,
        'Documents must be acknowledged before submit',
      );
    }
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
