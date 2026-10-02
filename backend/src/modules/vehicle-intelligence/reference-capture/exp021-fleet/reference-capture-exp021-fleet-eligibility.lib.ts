import { Exp021StudyStatus } from '@prisma/client';
import {
  proposeBalancedPhaseOrder,
  resolveShortAbPlanByRegistryKey,
} from './reference-capture-exp021-fleet-order-allocator.lib';
import type {
  Exp021FleetEligibilityInput,
  Exp021FleetEligibilityReasonCode,
  Exp021FleetEligibilityResult,
  Exp021FleetOrderBalanceSnapshot,
} from './reference-capture-exp021-fleet.types';

const EVIDENCE_CLOSED_STATUSES: Exp021StudyStatus[] = [
  Exp021StudyStatus.CLOSED,
  Exp021StudyStatus.MINIMUM_MATRIX_MET,
  Exp021StudyStatus.PROVISIONAL_DECISION_READY,
  Exp021StudyStatus.HIGH_CONFIDENCE_READY,
];

export function evaluateExp021FleetEligibility(
  input: Exp021FleetEligibilityInput,
  balance: Exp021FleetOrderBalanceSnapshot,
): Exp021FleetEligibilityResult {
  const reasonCodes: Exp021FleetEligibilityReasonCode[] = [];

  if (!input.fleetCoordinatorEnabled) reasonCodes.push('FLEET_COORDINATOR_DISABLED');
  if (!input.fleetDryRun) reasonCodes.push('FLEET_DRY_RUN_REQUIRED');
  if (!input.studyDryRun) reasonCodes.push('STUDY_DRY_RUN_REQUIRED');
  if (!input.referenceCaptureEnabled) reasonCodes.push('REFERENCE_CAPTURE_DISABLED');
  if (input.studyStatus !== Exp021StudyStatus.COLLECTING) reasonCodes.push('STUDY_NOT_COLLECTING');
  if (EVIDENCE_CLOSED_STATUSES.includes(input.studyStatus)) reasonCodes.push('STUDY_EVIDENCE_CLOSED');
  if (!input.enrollmentEnabled) reasonCodes.push('ENROLLMENT_DISABLED');
  if (input.resolvedTokenId == null) reasonCodes.push('TOKEN_UNRESOLVABLE');
  else if (input.resolvedTokenId !== input.enrolledTokenId) reasonCodes.push('TOKEN_MISMATCH');
  if (!input.allowedPlans.length) reasonCodes.push('ALLOWED_PLANS_EMPTY');
  if (!input.hfPolicyAllowed) reasonCodes.push('HF_POLICY_BLOCKED');
  if (input.activeSessionConflict) reasonCodes.push('ACTIVE_SESSION_CONFLICT');
  if (input.telemetryFreshness === 'UNAVAILABLE') reasonCodes.push('TELEMETRY_UNAVAILABLE');
  else if (input.telemetryFreshness === 'STALE') reasonCodes.push('TELEMETRY_STALE');

  const resolvablePlans = input.allowedPlans.filter((key) => resolveShortAbPlanByRegistryKey(key) != null);
  if (input.allowedPlans.length > 0 && resolvablePlans.length === 0) reasonCodes.push('PLAN_UNRESOLVABLE');

  const tokenId = input.resolvedTokenId;
  let proposedPlanId: string | null = null;
  let proposedPhaseOrderMs: number[] | null = null;

  if (reasonCodes.length === 0 && tokenId != null) {
    const proposed = proposeBalancedPhaseOrder({
      allowedPlans: resolvablePlans,
      vehicleId: input.vehicleId,
      balance,
    });
    if (!proposed) reasonCodes.push('PLAN_UNRESOLVABLE');
    else {
      proposedPlanId = proposed.planId;
      proposedPhaseOrderMs = proposed.phaseOrderMs;
    }
  }

  return {
    eligible: reasonCodes.length === 0,
    reasonCodes,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tokenId,
    proposedPlanId,
    proposedPhaseOrderMs,
  };
}

export function isStudyStatusEligibleForCollection(status: Exp021StudyStatus): boolean {
  return status === Exp021StudyStatus.COLLECTING;
}
