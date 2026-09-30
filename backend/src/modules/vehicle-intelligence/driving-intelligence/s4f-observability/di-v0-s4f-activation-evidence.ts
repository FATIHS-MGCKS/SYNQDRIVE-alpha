import { DI_V0_S4A_CONTRACT_VERSION } from '../s4a-foundation/di-v0-s4a-contract';

export type DiV0S4fGateState = 'SATISFIED' | 'NOT_SATISFIED' | 'UNKNOWN';

export type DiV0S4fReplayDeserializerEvidence = 'CLOSED' | 'OPEN' | 'UNKNOWN';
export type DiV0S4fSnapshotRehashEvidence = 'IMPLEMENTED' | 'NOT_IMPLEMENTED' | 'UNKNOWN';
export type DiV0S4fProviderBackpressureEvidence = 'CLOSED' | 'OPEN' | 'UNKNOWN';
export type DiV0S4fLocationRetentionGovernanceEvidence = 'PRESENT' | 'ABSENT' | 'UNKNOWN';
export type DiV0S4fOperatorAuthorizationEvidence = 'GRANTED' | 'DENIED' | 'UNKNOWN';

/** Explicit evidence for every frozen Tiny Activation gate — never inferred from repository layout. */
export interface DiV0S4fTinyActivationGateEvidence {
  replayDeserializerGap?: DiV0S4fReplayDeserializerEvidence;
  snapshotRehashVerification?: DiV0S4fSnapshotRehashEvidence;
  providerBackpressureGap?: DiV0S4fProviderBackpressureEvidence;
  locationRetentionGovernanceNote?: DiV0S4fLocationRetentionGovernanceEvidence;
  explicitOperatorAuthorization?: DiV0S4fOperatorAuthorizationEvidence;
}

function triStateToGate(
  value: string | undefined,
  satisfiedWhen: string,
): DiV0S4fGateState {
  if (value === undefined) return 'UNKNOWN';
  return value === satisfiedWhen ? 'SATISFIED' : 'NOT_SATISFIED';
}

export interface DiV0S4fActivationReadinessResult {
  contractVersion: typeof DI_V0_S4A_CONTRACT_VERSION;
  replayDeserializerGate: DiV0S4fGateState;
  snapshotRehashGate: DiV0S4fGateState;
  providerBackpressureGate: DiV0S4fGateState;
  locationRetentionGovernanceGate: DiV0S4fGateState;
  explicitOperatorAuthorizationGate: DiV0S4fGateState;
  finalState: 'READY' | 'NOT_READY';
  tinyActivationReady: false | true;
}

export function evaluateDiV0S4fTinyActivationReadiness(
  evidence: DiV0S4fTinyActivationGateEvidence = {},
): DiV0S4fActivationReadinessResult {
  const replayDeserializerGate = triStateToGate(evidence.replayDeserializerGap, 'CLOSED');
  const snapshotRehashGate = triStateToGate(evidence.snapshotRehashVerification, 'IMPLEMENTED');
  const providerBackpressureGate = triStateToGate(evidence.providerBackpressureGap, 'CLOSED');
  const locationRetentionGovernanceGate = triStateToGate(evidence.locationRetentionGovernanceNote, 'PRESENT');
  const explicitOperatorAuthorizationGate = triStateToGate(evidence.explicitOperatorAuthorization, 'GRANTED');

  const gateStates: DiV0S4fGateState[] = [
    replayDeserializerGate,
    snapshotRehashGate,
    providerBackpressureGate,
    locationRetentionGovernanceGate,
    explicitOperatorAuthorizationGate,
  ];
  const allSatisfied = gateStates.every((g) => g === 'SATISFIED');
  const finalState = allSatisfied ? 'READY' : 'NOT_READY';

  return {
    contractVersion: DI_V0_S4A_CONTRACT_VERSION,
    replayDeserializerGate,
    snapshotRehashGate,
    providerBackpressureGate,
    locationRetentionGovernanceGate,
    explicitOperatorAuthorizationGate,
    finalState,
    tinyActivationReady: finalState === 'READY',
  };
}

export function frozenTinyActivationGateKeys(): readonly string[] {
  return [
    'replayDeserializerGate',
    'snapshotRehashGate',
    'providerBackpressureGate',
    'locationRetentionGovernanceGate',
    'explicitOperatorAuthorizationGate',
  ];
}
