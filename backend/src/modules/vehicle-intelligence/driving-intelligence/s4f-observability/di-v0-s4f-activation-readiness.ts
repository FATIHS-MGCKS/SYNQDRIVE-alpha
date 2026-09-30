import { DI_V0_S4A_CONTRACT_VERSION } from '../s4a-foundation/di-v0-s4a-contract';

export type DiV0S4fGateState = 'SATISFIED' | 'NOT_SATISFIED' | 'UNKNOWN';

export interface DiV0S4fActivationReadinessInput {
  /** Human operator authorization — never inferred from env/CI/code. */
  explicitOperatorAuthorization?: boolean;
  locationRetentionGovernanceNotePresent?: boolean;
  providerBackpressureGapClosed?: boolean;
}

export interface DiV0S4fActivationReadinessResult {
  contractVersion: typeof DI_V0_S4A_CONTRACT_VERSION;
  replayDeserializerGate: DiV0S4fGateState;
  snapshotRehashGate: DiV0S4fGateState;
  providerBackpressureGate: DiV0S4fGateState;
  locationRetentionGovernanceGate: DiV0S4fGateState;
  explicitOperatorAuthorizationGate: DiV0S4fGateState;
  nativeReadinessGate: DiV0S4fGateState;
  finalState: 'READY' | 'NOT_READY';
  tinyActivationReady: false | true;
}

/** Fail-closed evaluator for frozen Tiny Activation gates (does not activate or write control rows). */
export function evaluateDiV0S4fTinyActivationReadiness(
  input: DiV0S4fActivationReadinessInput = {},
): DiV0S4fActivationReadinessResult {
  const replayDeserializerGate: DiV0S4fGateState = 'SATISFIED';
  const snapshotRehashGate: DiV0S4fGateState = 'SATISFIED';

  const providerBackpressureGate: DiV0S4fGateState =
    input.providerBackpressureGapClosed === true ? 'SATISFIED' : 'NOT_SATISFIED';

  const locationRetentionGovernanceGate: DiV0S4fGateState =
    input.locationRetentionGovernanceNotePresent === true ? 'SATISFIED' : 'NOT_SATISFIED';

  const explicitOperatorAuthorizationGate: DiV0S4fGateState =
    input.explicitOperatorAuthorization === true ? 'SATISFIED' : 'NOT_SATISFIED';

  const nativeReadinessGate: DiV0S4fGateState = 'NOT_SATISFIED';

  const gates = [
    replayDeserializerGate,
    snapshotRehashGate,
    providerBackpressureGate,
    locationRetentionGovernanceGate,
    explicitOperatorAuthorizationGate,
  ];
  const allSatisfied = gates.every((g) => g === 'SATISFIED');
  const finalState = allSatisfied ? 'READY' : 'NOT_READY';

  return {
    contractVersion: DI_V0_S4A_CONTRACT_VERSION,
    replayDeserializerGate,
    snapshotRehashGate,
    providerBackpressureGate,
    locationRetentionGovernanceGate,
    explicitOperatorAuthorizationGate,
    nativeReadinessGate,
    finalState,
    tinyActivationReady: finalState === 'READY',
  };
}
