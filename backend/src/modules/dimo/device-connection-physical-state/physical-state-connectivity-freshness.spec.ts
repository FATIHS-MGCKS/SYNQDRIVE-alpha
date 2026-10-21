import { DeviceConnectionPhysicalTransitionDecision } from '@prisma/client';
import { evaluatePhysicalStateTransition } from './device-connection-physical-state.policy';
import { buildBindingScopeFromToken } from './device-connection-physical-state.binding';
import {
  buildSnapshotGtR1Proof,
  buildSnapshotUnplugInitialEstablishmentGtR1Proof,
  buildSnapshotUnplugTransitionGtR1Proof,
  isProvenExpectedFixForPhysicalDecision,
  type SnapshotGtR1ProofInput,
} from './physical-state-gt-r1-proof';
import { isSnapshotObdEvidenceTelemetryEligible } from './physical-state-snapshot-telemetry-eligibility';
import { PhysicalStateCanonicalGate } from './physical-state-authority.types';
import { PhysicalStateShadowClassification } from './physical-state-shadow.classification';
import { comparePhysicalStateShadowDecisions } from './physical-state-shadow-comparator';

describe('physical-state-connectivity-freshness (GT-R1 UNPLUG matrix)', () => {
  const T0 = new Date('2026-09-16T10:36:56.000Z');
  const T1 = new Date('2026-09-17T08:07:14.000Z');
  const T2 = new Date('2026-09-18T00:03:43.588Z');
  const binding = buildBindingScopeFromToken({ provider: 'DIMO', tokenId: 187336 });

  const unplugTransitionBase: SnapshotGtR1ProofInput = {
    physicalProjectionState: 'PLUGGED',
    physicalProjectionEvidenceAt: T0,
    snapshotCandidatePlugged: false,
    snapshotEvidenceObservedAt: T1,
    legacyEvaluation: { action: 'reject', reason: 'obd_false' },
    physicalBindingScope: binding,
    legacyBindingKey: binding.bindingKey,
    episode: null,
    hardwareType: 'LTE_R1',
    snapshotSource: 'dimo',
    sourceSubtype: null,
    evidenceReferenceId: 'snap-unplug',
  };

  it('CASE A — current UNPLUGGED: no false PLUGGED bootstrap from stale cached PLUG replay', () => {
    expect(
      isSnapshotObdEvidenceTelemetryEligible(T1, T1),
    ).toBe(false);
    const proof = buildSnapshotGtR1Proof({
      physicalProjectionState: 'UNPLUGGED',
      physicalProjectionEvidenceAt: T1,
      snapshotCandidatePlugged: true,
      snapshotEvidenceObservedAt: T1,
      legacyEvaluation: { action: 'reject', reason: 'no_open_episode' },
      physicalBindingScope: binding,
      legacyBindingKey: binding.bindingKey,
      episode: null,
      hardwareType: 'LTE_R1',
      snapshotSource: 'dimo',
      sourceSubtype: null,
      evidenceReferenceId: 'stale-plug',
    });
    expect(proof).toBeNull();
  });

  it('CASE B — stale cached UNPLUG replay cannot mutate current state', () => {
    expect(isSnapshotObdEvidenceTelemetryEligible(T1, T1)).toBe(false);
    const evalResult = evaluatePhysicalStateTransition({
      current: {
        effectiveState: 'UNPLUGGED',
        evidenceObservedAt: T1,
        evidenceSource: 'SNAPSHOT_OBD',
        evidenceReferenceId: 'prior',
        stateVersion: 1,
      },
      incoming: {
        candidateState: 'UNPLUGGED',
        evidenceObservedAt: T1,
        evidenceSource: 'SNAPSHOT_OBD',
        evidenceReferenceId: 'replay',
      },
    });
    expect(evalResult.decision).not.toBe(DeviceConnectionPhysicalTransitionDecision.APPLIED);
  });

  it('CASE C — stale cached PLUG replay while offline cannot bootstrap PLUGGED', () => {
    expect(isSnapshotObdEvidenceTelemetryEligible(T0, T1)).toBe(false);
  });

  it('CASE D — fresh UNPLUG establishes legitimate PLUGGED→UNPLUGGED proof', () => {
    const proof = buildSnapshotUnplugTransitionGtR1Proof(unplugTransitionBase);
    expect(proof?.scenario).toBe('SNAPSHOT_UNPLUG_TRANSITION');
    expect(
      isProvenExpectedFixForPhysicalDecision(
        proof,
        DeviceConnectionPhysicalTransitionDecision.APPLIED,
      ),
    ).toBe(true);
  });

  it('CASE E — fresh reconnect remains PLUG proof path', () => {
    const proof = buildSnapshotGtR1Proof({
      physicalProjectionState: 'UNPLUGGED',
      physicalProjectionEvidenceAt: T1,
      snapshotCandidatePlugged: true,
      snapshotEvidenceObservedAt: T2,
      legacyEvaluation: { action: 'reject', reason: 'no_open_episode' },
      physicalBindingScope: binding,
      legacyBindingKey: binding.bindingKey,
      episode: null,
      hardwareType: 'LTE_R1',
      snapshotSource: 'dimo',
      sourceSubtype: null,
      evidenceReferenceId: 'reconnect',
    });
    expect(proof?.scenario).toBe('SNAPSHOT_PLUG_REPAIR_UNPLUGGED_BASELINE');
  });

  it('CASE F — pre-reconnect evidence cannot override newer reconnect boundary', () => {
    const stale = evaluatePhysicalStateTransition({
      current: {
        effectiveState: 'PLUGGED',
        evidenceObservedAt: T2,
        evidenceSource: 'WEBHOOK',
        evidenceReferenceId: 'reconnect',
        stateVersion: 2,
      },
      incoming: {
        candidateState: 'UNPLUGGED',
        evidenceObservedAt: T1,
        evidenceSource: 'SNAPSHOT_OBD',
        evidenceReferenceId: 'pre-reconnect',
      },
    });
    expect(stale.decision).toBe(DeviceConnectionPhysicalTransitionDecision.STALE);
  });

  it('CASE G — duplicate/out-of-order older event preserves monotonic state', () => {
    const outOfOrder = evaluatePhysicalStateTransition({
      current: {
        effectiveState: 'UNPLUGGED',
        evidenceObservedAt: T2,
        evidenceSource: 'WEBHOOK',
        evidenceReferenceId: 'newer',
        stateVersion: 3,
      },
      incoming: {
        candidateState: 'PLUGGED',
        evidenceObservedAt: T1,
        evidenceSource: 'SNAPSHOT_OBD',
        evidenceReferenceId: 'older',
      },
    });
    expect(outOfOrder.decision).toBe(DeviceConnectionPhysicalTransitionDecision.STALE);
  });

  it('CASE H — Arteon failure shape: stale replay ineligible, fresh disagreement still blocks', () => {
    expect(isSnapshotObdEvidenceTelemetryEligible(T1, T1)).toBe(false);

    const freshDisagreement = comparePhysicalStateShadowDecisions({
      scope: {
        organizationId: 'org',
        vehicleId: 'veh',
        provider: 'DIMO',
      },
      legacyBindingKey: binding.bindingKey,
      physicalBindingKey: binding.bindingKey,
      legacyDecision: {
        accepted: false,
        reason: 'obd_false',
        gate: PhysicalStateCanonicalGate.LEGACY,
      },
      physicalDecision: {
        accepted: true,
        reason: 'state_transition',
        gate: PhysicalStateCanonicalGate.PHYSICAL,
        transitionDecision: DeviceConnectionPhysicalTransitionDecision.APPLIED,
        effectiveState: 'UNPLUGGED',
      },
      provenExpectedFix: false,
      equalTimeOpposingState: false,
    });
    expect(freshDisagreement.classification).toBe(
      PhysicalStateShadowClassification.UNEXPLAINED_OLD_REJECT_NEW_ACCEPT,
    );
    expect(freshDisagreement.correctnessBlocking).toBe(true);
  });

  it('fresh UNPLUG bootstrap proof for absent projection', () => {
    const proof = buildSnapshotUnplugInitialEstablishmentGtR1Proof({
      physicalProjectionState: null,
      physicalProjectionEvidenceAt: null,
      snapshotCandidatePlugged: false,
      snapshotEvidenceObservedAt: T1,
      legacyEvaluation: { action: 'reject', reason: 'obd_false' },
      physicalBindingScope: binding,
      legacyBindingKey: binding.bindingKey,
      episode: null,
      hardwareType: 'LTE_R1',
      snapshotSource: 'dimo',
      sourceSubtype: null,
      evidenceReferenceId: 'bootstrap-unplug',
    });
    expect(proof?.scenario).toBe('SNAPSHOT_UNPLUG_INITIAL_ESTABLISHMENT');
    expect(
      isProvenExpectedFixForPhysicalDecision(
        proof,
        DeviceConnectionPhysicalTransitionDecision.ESTABLISHED,
      ),
    ).toBe(true);
  });
});
