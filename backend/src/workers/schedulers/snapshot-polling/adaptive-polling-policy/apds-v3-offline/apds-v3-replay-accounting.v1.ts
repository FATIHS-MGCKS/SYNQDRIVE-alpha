import type { ApdsV3OfflinePolicyDecision } from './apds-v3-offline.types';
import { evaluateFrozenB2B4Intersection } from './p25-apd-b2b4-intersection.v1';
import type { P25ApdShadowDecision } from '../p25-apd-shadow-decision.types';

export type PhysicalRequestOutcomeClass =
  | 'BASELINE_ELIGIBLE_PHYSICAL_OPPORTUNITY'
  | 'BASELINE_NOT_DUE_DECISION_TICK'
  | 'V3_PROJECTED_PHYSICAL_POLL'
  | 'V3_PROJECTED_AUTHORITATIVE_SAFE_SKIP'
  | 'V3_PROJECTED_HEURISTIC_SKIP'
  | 'V3_PRESERVE_BASELINE_INSUFFICIENT_EVIDENCE'
  | 'V3_PRESERVE_BASELINE_NOT_ASSESSABLE'
  | 'HYPOTHETICAL_INCREMENTAL_SKIP_VS_BASELINE';

export type ReplayPhysicalAccounting = {
  baselineDue: boolean;
  outcomeClass: PhysicalRequestOutcomeClass;
  countsTowardProjectedPhysicalPoll: boolean;
  countsTowardHypotheticalSkipSavings: boolean;
};

export function classifyV3ReplayPhysicalAccounting(input: {
  baselineDue: boolean;
  v3: ApdsV3OfflinePolicyDecision;
  b2: P25ApdShadowDecision;
  b4: P25ApdShadowDecision;
}): ReplayPhysicalAccounting {
  const joint = evaluateFrozenB2B4Intersection(input.b2, input.b4);

  let outcomeClass: PhysicalRequestOutcomeClass;
  let countsTowardProjectedPhysicalPoll = false;
  let countsTowardHypotheticalSkipSavings = false;

  if (!input.baselineDue) {
    outcomeClass = 'BASELINE_NOT_DUE_DECISION_TICK';
    return {
      baselineDue: false,
      outcomeClass,
      countsTowardProjectedPhysicalPoll: false,
      countsTowardHypotheticalSkipSavings: false,
    };
  }

  outcomeClass = 'BASELINE_ELIGIBLE_PHYSICAL_OPPORTUNITY';

  switch (input.v3.decision) {
    case 'WOULD_POLL':
    case 'FORCED_SAFETY_POLL':
      outcomeClass = 'V3_PROJECTED_PHYSICAL_POLL';
      countsTowardProjectedPhysicalPoll = true;
      break;
    case 'INSUFFICIENT_EVIDENCE':
      outcomeClass = 'V3_PRESERVE_BASELINE_INSUFFICIENT_EVIDENCE';
      countsTowardProjectedPhysicalPoll = true;
      break;
    case 'NOT_ASSESSABLE':
      outcomeClass = 'V3_PRESERVE_BASELINE_NOT_ASSESSABLE';
      countsTowardProjectedPhysicalPoll = true;
      break;
    case 'WOULD_SKIP':
      if (input.v3.reason.includes('LOW_HEURISTIC') || input.v3.reason.includes('HYSTERESIS')) {
        outcomeClass = 'V3_PROJECTED_HEURISTIC_SKIP';
      } else {
        outcomeClass = 'V3_PROJECTED_AUTHORITATIVE_SAFE_SKIP';
      }
      countsTowardHypotheticalSkipSavings = joint.kind === 'JOINT_SKIP_CANDIDATE';
      break;
    default:
      outcomeClass = 'V3_PRESERVE_BASELINE_NOT_ASSESSABLE';
      countsTowardProjectedPhysicalPoll = true;
  }

  if (
    countsTowardHypotheticalSkipSavings &&
    input.baselineDue &&
    !countsTowardProjectedPhysicalPoll
  ) {
    outcomeClass = 'HYPOTHETICAL_INCREMENTAL_SKIP_VS_BASELINE';
  }

  return {
    baselineDue: input.baselineDue,
    outcomeClass,
    countsTowardProjectedPhysicalPoll,
    countsTowardHypotheticalSkipSavings,
  };
}

/** Dedupe key for physical request identity when evidence supplies one. */
export function physicalRequestDedupKey(parts: {
  organizationId: string;
  vehicleId: string;
  physicalRequestId?: string | null;
  decisionAtMs: number;
}): string {
  if (parts.physicalRequestId) {
    return `phys:${parts.organizationId}:${parts.vehicleId}:${parts.physicalRequestId}`;
  }
  return `tick:${parts.organizationId}:${parts.vehicleId}:${parts.decisionAtMs}`;
}
