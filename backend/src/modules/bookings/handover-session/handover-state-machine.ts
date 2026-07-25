import type { HandoverKind, HandoverSessionStatus } from '@prisma/client';
import { evaluatePickupTransitionPolicy } from './handover-pickup-transition.policy';
import { evaluateReturnTransitionPolicy } from './return-transition.policy';
import {
  resolveTargetStatusForAction,
} from './handover-session-transition.matrix';
import { HANDOVER_SESSION_ERROR } from './handover-session.errors';
import {
  denyHandoverTransition,
} from './handover-transition.base';
import type {
  HandoverSessionTransitionAction,
  HandoverTransitionDecision,
  HandoverTransitionEvaluateInput,
} from './handover-session.types';

/**
 * Central domain evaluator for handover session transitions.
 * All status changes must pass through this module.
 */
export class HandoverStateMachine {
  evaluate(input: HandoverTransitionEvaluateInput): HandoverTransitionDecision {
    const toStatus = input.toStatus;
    if (!toStatus) {
      return denyHandoverTransition(
        HANDOVER_SESSION_ERROR.INVALID_STATUS,
        'Target status is required',
      );
    }
    return evaluateTransitionPolicyForKind(input.kind, input);
  }

  resolveTargetStatus(
    action: HandoverSessionTransitionAction,
    explicitTo?: HandoverSessionStatus,
  ): HandoverSessionStatus | null {
    return resolveTargetStatusForAction(action, explicitTo);
  }
}

export function evaluateTransitionPolicyForKind(
  kind: HandoverKind,
  input: HandoverTransitionEvaluateInput,
): HandoverTransitionDecision {
  if (kind === 'RETURN') {
    return evaluateReturnTransitionPolicy(input);
  }
  return evaluatePickupTransitionPolicy(input);
}

export const handoverStateMachine = new HandoverStateMachine();
