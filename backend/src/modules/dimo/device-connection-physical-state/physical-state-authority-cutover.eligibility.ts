import { DeviceConnectionPhysicalAuthorityMode } from '@prisma/client';
import type { PhysicalAuthorityScope } from './device-connection-physical-authority-cutover.repository';
import {
  evaluateMixedReplicaCutoverInterlock,
  loadMixedReplicaInterlockFromEnv,
  type MixedReplicaInterlockResult,
} from './physical-state-cutover-mixed-replica-interlock';
import {
  PhysicalStateCutoverActivationEvidence,
  PhysicalStateCutoverEligibilityResult,
  PhysicalStateCutoverEligibilityStatus,
} from './physical-state-authority-cutover.types';

export type EvaluateCutoverEligibilityInput = {
  scope: PhysicalAuthorityScope;
  currentAuthorityMode: DeviceConnectionPhysicalAuthorityMode;
  activationEvidence?: PhysicalStateCutoverActivationEvidence;
  mixedReplicaInterlock?: MixedReplicaInterlockResult;
};

export function evaluatePhysicalStateCutoverEligibility(
  input: EvaluateCutoverEligibilityInput,
): PhysicalStateCutoverEligibilityResult {
  const blockingReasons: string[] = [];

  if (input.currentAuthorityMode === DeviceConnectionPhysicalAuthorityMode.PHYSICAL) {
    return {
      status: PhysicalStateCutoverEligibilityStatus.ALREADY_PHYSICAL,
      scope: input.scope,
      currentAuthorityMode: input.currentAuthorityMode,
      blockingReasons: [],
    };
  }

  const evidence: PhysicalStateCutoverActivationEvidence = {
    targetPreseedDryRunProven: false,
    unexplainedDivergencesZeroProven: false,
    mixedReplicaGateProven: false,
    runtimeReady: false,
    ...input.activationEvidence,
  };

  if (!evidence.runtimeReady) {
    blockingReasons.push('runtime_not_ready');
  }
  if (!evidence.targetPreseedDryRunProven) {
    blockingReasons.push('target_preseed_dry_run_not_proven');
  }
  if (!evidence.unexplainedDivergencesZeroProven) {
    blockingReasons.push('unexplained_divergences_not_proven_zero');
  }

  const interlock =
    input.mixedReplicaInterlock ??
    evaluateMixedReplicaCutoverInterlock(loadMixedReplicaInterlockFromEnv());

  if (!evidence.mixedReplicaGateProven) {
    blockingReasons.push('mixed_replica_gate_not_proven');
  } else if (!interlock.safe) {
    blockingReasons.push(...interlock.details);
  }

  if (blockingReasons.length === 0) {
    return {
      status: PhysicalStateCutoverEligibilityStatus.ELIGIBLE,
      scope: input.scope,
      currentAuthorityMode: input.currentAuthorityMode,
      blockingReasons: [],
    };
  }

  let status = PhysicalStateCutoverEligibilityStatus.BLOCKED_OTHER_SAFETY_GATE;
  if (!evidence.targetPreseedDryRunProven) {
    status = PhysicalStateCutoverEligibilityStatus.BLOCKED_TARGET_PRESEED_NOT_PROVEN;
  } else if (!evidence.unexplainedDivergencesZeroProven) {
    status = PhysicalStateCutoverEligibilityStatus.BLOCKED_UNEXPLAINED_DIVERGENCES;
  } else if (!evidence.mixedReplicaGateProven || !interlock.safe) {
    status = PhysicalStateCutoverEligibilityStatus.BLOCKED_MIXED_REPLICA;
  } else if (!evidence.runtimeReady) {
    status = PhysicalStateCutoverEligibilityStatus.BLOCKED_RUNTIME_NOT_READY;
  }

  return {
    status,
    scope: input.scope,
    currentAuthorityMode: input.currentAuthorityMode,
    blockingReasons,
  };
}
