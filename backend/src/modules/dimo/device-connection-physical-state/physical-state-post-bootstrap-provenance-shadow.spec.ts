import { DeviceConnectionPhysicalTransitionDecision } from '@prisma/client';
import {
  buildSnapshotGtR1Proof,
  buildSnapshotPlugPostBootstrapProvenanceRefreshGtR1Proof,
  isProvenExpectedFixForPhysicalDecision,
  type SnapshotGtR1ProofInput,
} from './physical-state-gt-r1-proof';
import { PhysicalStateCanonicalGate } from './physical-state-authority.types';
import { comparePhysicalStateShadowDecisions } from './physical-state-shadow-comparator';
import { PhysicalStateShadowClassification } from './physical-state-shadow.classification';
import { inferPhysicalStateShadowComparisonDomain } from './physical-state-shadow-comparison-domain';
import { buildBindingScopeFromToken } from './device-connection-physical-state.binding';
import { evaluatePhysicalStateTransition } from './device-connection-physical-state.policy';
import { isSnapshotObdEvidenceTelemetryEligible } from './physical-state-snapshot-telemetry-eligibility';

describe('P2.5 post-bootstrap PROVENANCE_REFRESH shadow semantics', () => {
  const T0 = new Date('2026-09-16T13:35:50.000Z');
  const T1 = new Date('2026-09-18T10:40:47.000Z');
  const binding = buildBindingScopeFromToken({ provider: 'DIMO', tokenId: 70140 });

  const production107ShapeProofInput: SnapshotGtR1ProofInput = {
    physicalProjectionState: 'PLUGGED',
    physicalProjectionEvidenceAt: T0,
    snapshotCandidatePlugged: true,
    snapshotEvidenceObservedAt: T1,
    legacyEvaluation: { action: 'reject', reason: 'no_open_episode' },
    physicalBindingScope: binding,
    legacyBindingKey: binding.bindingKey,
    episode: null,
    hardwareType: 'LTE_R1',
    snapshotSource: 'dimo',
    sourceSubtype: null,
    evidenceReferenceId: `vls:test-vls:obd:${T1.toISOString()}`,
  };

  it('EXACT_107_SHAPE — proof valid; PROVENANCE_REFRESH => EXPECTED_FIX non-blocking', () => {
    const proof = buildSnapshotPlugPostBootstrapProvenanceRefreshGtR1Proof(
      production107ShapeProofInput,
    );
    expect(proof?.scenario).toBe('SNAPSHOT_PLUG_POST_BOOTSTRAP_PROVENANCE_REFRESH');
    expect(
      isProvenExpectedFixForPhysicalDecision(
        proof,
        DeviceConnectionPhysicalTransitionDecision.PROVENANCE_REFRESH,
      ),
    ).toBe(true);
    expect(
      isProvenExpectedFixForPhysicalDecision(
        proof,
        DeviceConnectionPhysicalTransitionDecision.APPLIED,
      ),
    ).toBe(false);

    const transition = evaluatePhysicalStateTransition({
      current: {
        effectiveState: 'PLUGGED',
        evidenceObservedAt: T0,
        evidenceSource: 'SNAPSHOT_OBD',
        evidenceReferenceId: 'prior',
        stateVersion: 2,
      },
      incoming: {
        candidateState: 'PLUGGED',
        evidenceObservedAt: T1,
        evidenceSource: 'SNAPSHOT_OBD',
        evidenceReferenceId: production107ShapeProofInput.evidenceReferenceId,
      },
    });
    expect(transition.decision).toBe(DeviceConnectionPhysicalTransitionDecision.PROVENANCE_REFRESH);
    expect(transition.refreshProvenanceOnly).toBe(true);

    const comparison = comparePhysicalStateShadowDecisions({
      scope: { organizationId: 'org', vehicleId: 'veh', provider: 'DIMO' },
      legacyBindingKey: binding.bindingKey,
      physicalBindingKey: binding.bindingKey,
      legacyDecision: {
        accepted: false,
        reason: 'no_open_episode',
        gate: PhysicalStateCanonicalGate.LEGACY,
      },
      physicalDecision: {
        accepted: true,
        reason: transition.reason,
        gate: PhysicalStateCanonicalGate.PHYSICAL,
        transitionDecision: transition.decision,
        effectiveState: 'PLUGGED',
      },
      provenExpectedFix: isProvenExpectedFixForPhysicalDecision(proof, transition.decision),
    });

    expect(comparison.classification).toBe(
      PhysicalStateShadowClassification.EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT,
    );
    expect(comparison.correctnessBlocking).toBe(false);
    expect(
      inferPhysicalStateShadowComparisonDomain({
        scope: { organizationId: 'org', vehicleId: 'veh', provider: 'DIMO' },
        legacyDecision: {
          accepted: false,
          reason: 'no_open_episode',
          gate: PhysicalStateCanonicalGate.LEGACY,
        },
        physicalDecision: {
          accepted: true,
          reason: transition.reason,
          gate: PhysicalStateCanonicalGate.PHYSICAL,
          transitionDecision: transition.decision,
          effectiveState: 'PLUGGED',
        },
      }),
    ).toBe('SAME_STATE_PROVENANCE_REFRESH');
  });

  it('CASE F — same shape without valid proof remains UNEXPLAINED blocking', () => {
    const comparison = comparePhysicalStateShadowDecisions({
      scope: { organizationId: 'org', vehicleId: 'veh', provider: 'DIMO' },
      legacyBindingKey: binding.bindingKey,
      physicalBindingKey: binding.bindingKey,
      legacyDecision: {
        accepted: false,
        reason: 'no_open_episode',
        gate: PhysicalStateCanonicalGate.LEGACY,
      },
      physicalDecision: {
        accepted: true,
        reason: 'newer_provenance_same_state',
        gate: PhysicalStateCanonicalGate.PHYSICAL,
        transitionDecision: DeviceConnectionPhysicalTransitionDecision.PROVENANCE_REFRESH,
        effectiveState: 'PLUGGED',
      },
      provenExpectedFix: false,
    });
    expect(comparison.classification).toBe(
      PhysicalStateShadowClassification.UNEXPLAINED_OLD_REJECT_NEW_ACCEPT,
    );
    expect(comparison.correctnessBlocking).toBe(true);
  });

  it('CASE A — fresh APPLIED state transition without proof stays blocking', () => {
    const comparison = comparePhysicalStateShadowDecisions({
      scope: { organizationId: 'org', vehicleId: 'veh', provider: 'DIMO' },
      legacyBindingKey: binding.bindingKey,
      physicalBindingKey: binding.bindingKey,
      legacyDecision: {
        accepted: false,
        reason: 'no_open_episode',
        gate: PhysicalStateCanonicalGate.LEGACY,
      },
      physicalDecision: {
        accepted: true,
        reason: 'state_transition',
        gate: PhysicalStateCanonicalGate.PHYSICAL,
        transitionDecision: DeviceConnectionPhysicalTransitionDecision.APPLIED,
        effectiveState: 'PLUGGED',
      },
      provenExpectedFix: false,
    });
    expect(comparison.classification).toBe(
      PhysicalStateShadowClassification.UNEXPLAINED_OLD_REJECT_NEW_ACCEPT,
    );
    expect(comparison.correctnessBlocking).toBe(true);
  });

  it('CASE G — opposite UNPLUG snapshot cannot establish post-bootstrap plug refresh proof', () => {
    const proof = buildSnapshotGtR1Proof({
      ...production107ShapeProofInput,
      snapshotCandidatePlugged: false,
      legacyEvaluation: { action: 'reject', reason: 'obd_false' },
    });
    expect(proof?.scenario).not.toBe('SNAPSHOT_PLUG_POST_BOOTSTRAP_PROVENANCE_REFRESH');
  });

  it('CASE B — stale snapshot ineligible (no proof from stale replay)', () => {
    expect(isSnapshotObdEvidenceTelemetryEligible(T0, T1)).toBe(false);
    const proof = buildSnapshotPlugPostBootstrapProvenanceRefreshGtR1Proof({
      ...production107ShapeProofInput,
      snapshotEvidenceObservedAt: T0,
      physicalProjectionEvidenceAt: T1,
    });
    expect(proof).toBeNull();
  });

  it('bootstrap vs post-bootstrap remain disjoint', () => {
    const bootstrap = buildSnapshotGtR1Proof({
      ...production107ShapeProofInput,
      physicalProjectionState: null,
      physicalProjectionEvidenceAt: null,
    });
    expect(bootstrap?.scenario).toBe('SNAPSHOT_PLUG_INITIAL_ESTABLISHMENT');

    const steady = buildSnapshotGtR1Proof(production107ShapeProofInput);
    expect(steady?.scenario).toBe('SNAPSHOT_PLUG_POST_BOOTSTRAP_PROVENANCE_REFRESH');
  });
});
