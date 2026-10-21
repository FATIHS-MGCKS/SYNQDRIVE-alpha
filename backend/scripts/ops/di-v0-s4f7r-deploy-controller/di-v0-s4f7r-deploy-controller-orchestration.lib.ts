/**
 * EXP-021 S4F-7R — deploy controller vs runtime RC authority (pure simulation/tests).
 */
import {
  DI_S4F7Q_FROZEN_EXPECTED_OLD_PRODUCTION_SHA,
  DI_S4F7Q_FROZEN_TARGET_RC_SHA,
} from '../di-v0-s4f7q-exact-rc-attestation-deploy/di-v0-s4f7q-exact-rc-attestation-deploy.lib';

export const DI_S4F7R_RUNTIME_RC_SHA = DI_S4F7Q_FROZEN_TARGET_RC_SHA;
export const DI_S4F7R_OLD_PRODUCTION_SHA = DI_S4F7Q_FROZEN_EXPECTED_OLD_PRODUCTION_SHA;

export interface DiS4f7rTopologyFixture {
  controllerHasS4f7qLib: boolean;
  controllerHasS4f7qCli: boolean;
  targetHasS4f7qLib: boolean;
  targetHasS4f7qCli: boolean;
  currentSymlinkPointsToTarget: boolean;
  attestationGateEnabled: boolean;
  forwardExactRcGate: boolean;
  deployControllerRootSet: boolean;
  controllerShaMatchesExpected: boolean;
}

export function classifyPreS4f7rDefect(fixture: DiS4f7rTopologyFixture): {
  targetReleaseSuppliesReplicaLib: boolean;
  rcContainsS4f7qGuard: boolean;
  gateReachableDuringRealRcDeploy: boolean;
  currentLinkPointsToRcDuringGate: boolean;
  rcContainsS4f7qCli: boolean;
  gateCliPathValidDuringRealDeploy: boolean;
  rollbackWithGateAcceptsOldSha: boolean;
} {
  const targetReleaseSuppliesReplicaLib = true;
  const rcContainsS4f7qGuard = fixture.targetHasS4f7qLib;
  const gateReachableDuringRealRcDeploy = fixture.attestationGateEnabled && rcContainsS4f7qGuard;
  const currentLinkPointsToRcDuringGate =
    fixture.attestationGateEnabled && fixture.currentSymlinkPointsToTarget;
  const rcContainsS4f7qCli = fixture.targetHasS4f7qCli;
  const gateCliPathValidDuringRealDeploy =
    fixture.attestationGateEnabled && rcContainsS4f7qCli && currentLinkPointsToRcDuringGate;
  const rollbackWithGateAcceptsOldSha =
    fixture.attestationGateEnabled && fixture.forwardExactRcGate ? false : true;

  return {
    targetReleaseSuppliesReplicaLib,
    rcContainsS4f7qGuard,
    gateReachableDuringRealRcDeploy,
    currentLinkPointsToRcDuringGate,
    rcContainsS4f7qCli,
    gateCliPathValidDuringRealDeploy,
    rollbackWithGateAcceptsOldSha,
  };
}

export interface DiS4f7rRollingSimInput {
  phase: 'FORWARD' | 'ROLLBACK';
  targetSha: string;
  currentReleaseShaBeforeSwitch: string;
  attestationGate: boolean;
  forwardExactRcGate: boolean;
  aHealthy: boolean;
  aAttestationPass: boolean;
  bRestarted: boolean;
  bHealthy: boolean;
  bAttestationPass: boolean;
  controllerCliAvailable: boolean;
}

export interface DiS4f7rRollingSimResult {
  bRestartAttempted: boolean;
  rollbackTriggered: boolean;
  finalCurrentReleaseSha: string;
  replicaAFinalSha: string;
  replicaBFinalSha: string;
  finalMixedSha: boolean;
  successfulGuardedSequence: boolean;
}

export function simulateS4f7rRollingSequence(input: DiS4f7rRollingSimInput): DiS4f7rRollingSimResult {
  const isForward = input.phase === 'FORWARD';
  const target = isForward ? input.targetSha : DI_S4F7R_OLD_PRODUCTION_SHA;

  if (input.phase === 'ROLLBACK') {
    return {
      bRestartAttempted: true,
      rollbackTriggered: true,
      finalCurrentReleaseSha: DI_S4F7R_OLD_PRODUCTION_SHA,
      replicaAFinalSha: DI_S4F7R_OLD_PRODUCTION_SHA,
      replicaBFinalSha: DI_S4F7R_OLD_PRODUCTION_SHA,
      finalMixedSha: false,
      successfulGuardedSequence: false,
    };
  }

  if (input.attestationGate && input.forwardExactRcGate) {
    if (input.targetSha !== DI_S4F7R_RUNTIME_RC_SHA) {
      return failRollback(input.currentReleaseShaBeforeSwitch);
    }
    if (input.currentReleaseShaBeforeSwitch !== DI_S4F7R_OLD_PRODUCTION_SHA) {
      return failRollback(input.currentReleaseShaBeforeSwitch);
    }
  }

  if (!input.controllerCliAvailable && input.attestationGate) {
    return failRollback(input.currentReleaseShaBeforeSwitch);
  }

  if (!input.aHealthy) {
    return failRollback(input.currentReleaseShaBeforeSwitch);
  }

  if (input.attestationGate && !input.aAttestationPass) {
    return {
      bRestartAttempted: false,
      rollbackTriggered: true,
      finalCurrentReleaseSha: DI_S4F7R_OLD_PRODUCTION_SHA,
      replicaAFinalSha: DI_S4F7R_OLD_PRODUCTION_SHA,
      replicaBFinalSha: DI_S4F7R_OLD_PRODUCTION_SHA,
      finalMixedSha: false,
      successfulGuardedSequence: false,
    };
  }

  if (!input.bRestarted) {
    return {
      bRestartAttempted: false,
      rollbackTriggered: false,
      finalCurrentReleaseSha: input.targetSha,
      replicaAFinalSha: input.targetSha,
      replicaBFinalSha: input.currentReleaseShaBeforeSwitch,
      finalMixedSha: true,
      successfulGuardedSequence: false,
    };
  }

  if (!input.bHealthy || (input.attestationGate && !input.bAttestationPass)) {
    return failRollback(DI_S4F7R_OLD_PRODUCTION_SHA);
  }

  return {
    bRestartAttempted: true,
    rollbackTriggered: false,
    finalCurrentReleaseSha: input.targetSha,
    replicaAFinalSha: input.targetSha,
    replicaBFinalSha: input.targetSha,
    finalMixedSha: false,
    successfulGuardedSequence: true,
  };
}

function failRollback(restoreSha: string): DiS4f7rRollingSimResult {
  return {
    bRestartAttempted: false,
    rollbackTriggered: true,
    finalCurrentReleaseSha: restoreSha,
    replicaAFinalSha: restoreSha,
    replicaBFinalSha: restoreSha,
    finalMixedSha: false,
    successfulGuardedSequence: false,
  };
}

export function resolveAttestationCliBackendRoot(
  deployControllerRoot: string | null,
  currentSymlinkBackendRoot: string,
): string {
  if (deployControllerRoot) {
    return `${deployControllerRoot}/backend`;
  }
  return currentSymlinkBackendRoot;
}

export function guardedDeployUsesControllerOrchestration(input: {
  attestationGate: boolean;
  deployControllerRootSet: boolean;
  controllerShaMatches: boolean;
}): boolean {
  return input.attestationGate && input.deployControllerRootSet && input.controllerShaMatches;
}
