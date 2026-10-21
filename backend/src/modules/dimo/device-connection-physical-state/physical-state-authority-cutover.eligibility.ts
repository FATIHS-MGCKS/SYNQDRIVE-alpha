import { DeviceConnectionPhysicalAuthorityMode } from '@prisma/client';
import type { PhysicalAuthorityScope } from './device-connection-physical-authority-cutover.repository';
import {
  PhysicalStateCutoverEligibilityResult,
  PhysicalStateCutoverEligibilityStatus,
} from './physical-state-authority-cutover.types';
import {
  PhysicalStateCutoverEvidenceVerificationStatus,
  type PhysicalStateCutoverEvidenceVerificationResult,
} from './physical-state-cutover-evidence.types';

export type EvaluateCutoverEligibilityInput = {
  scope: PhysicalAuthorityScope;
  currentAuthorityMode: DeviceConnectionPhysicalAuthorityMode;
  evidenceVerification: PhysicalStateCutoverEvidenceVerificationResult;
};

function mapVerificationStatusToEligibility(
  status: Exclude<
    PhysicalStateCutoverEvidenceVerificationStatus,
    PhysicalStateCutoverEvidenceVerificationStatus.VALID
  >,
): PhysicalStateCutoverEligibilityStatus {
  switch (status) {
    case PhysicalStateCutoverEvidenceVerificationStatus.PRESEED_PROOF_INVALID:
    case PhysicalStateCutoverEvidenceVerificationStatus.PRESEED_PROOF_STALE:
    case PhysicalStateCutoverEvidenceVerificationStatus.TARGET_NOT_APPROVED:
      return PhysicalStateCutoverEligibilityStatus.BLOCKED_TARGET_PRESEED_NOT_PROVEN;
    case PhysicalStateCutoverEvidenceVerificationStatus.UNEXPLAINED_PROOF_INVALID:
    case PhysicalStateCutoverEvidenceVerificationStatus.UNEXPLAINED_COUNT_NONZERO:
    case PhysicalStateCutoverEvidenceVerificationStatus.OBSERVATION_WINDOW_INSUFFICIENT:
      return PhysicalStateCutoverEligibilityStatus.BLOCKED_UNEXPLAINED_DIVERGENCES;
    case PhysicalStateCutoverEvidenceVerificationStatus.MIXED_REPLICA_PROOF_INVALID:
    case PhysicalStateCutoverEvidenceVerificationStatus.PEER_SET_MISMATCH:
    case PhysicalStateCutoverEvidenceVerificationStatus.RUNTIME_INTERLOCK_UNSAFE:
      return PhysicalStateCutoverEligibilityStatus.BLOCKED_MIXED_REPLICA;
    case PhysicalStateCutoverEvidenceVerificationStatus.BUILD_MISMATCH:
      return PhysicalStateCutoverEligibilityStatus.BLOCKED_RUNTIME_NOT_READY;
    default:
      return PhysicalStateCutoverEligibilityStatus.BLOCKED_EVIDENCE_PROVENANCE;
  }
}

export function evaluatePhysicalStateCutoverEligibility(
  input: EvaluateCutoverEligibilityInput,
): PhysicalStateCutoverEligibilityResult {
  if (input.currentAuthorityMode === DeviceConnectionPhysicalAuthorityMode.PHYSICAL) {
    return {
      status: PhysicalStateCutoverEligibilityStatus.ALREADY_PHYSICAL,
      scope: input.scope,
      currentAuthorityMode: input.currentAuthorityMode,
      blockingReasons: [],
    };
  }

  if (input.evidenceVerification.status === PhysicalStateCutoverEvidenceVerificationStatus.VALID) {
    return {
      status: PhysicalStateCutoverEligibilityStatus.ELIGIBLE,
      scope: input.scope,
      currentAuthorityMode: input.currentAuthorityMode,
      blockingReasons: [],
      evidenceVerificationStatus: input.evidenceVerification.status,
    };
  }

  const verification = input.evidenceVerification;
  const status = mapVerificationStatusToEligibility(verification.status);

  return {
    status,
    scope: input.scope,
    currentAuthorityMode: input.currentAuthorityMode,
    blockingReasons: verification.details,
    evidenceVerificationStatus: verification.status,
  };
}
