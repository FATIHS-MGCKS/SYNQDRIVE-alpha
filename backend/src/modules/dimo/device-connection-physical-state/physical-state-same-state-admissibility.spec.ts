import { DeviceConnectionPhysicalEvidenceSource, DeviceConnectionPhysicalTransitionDecision } from '@prisma/client';
import { PhysicalStateCanonicalGate } from './physical-state-authority.types';
import { evaluatePhysicalStateTransition } from './device-connection-physical-state.policy';
import { comparePhysicalStateShadowDecisions } from './physical-state-shadow-comparator';
import { PhysicalStateShadowClassification } from './physical-state-shadow.classification';
import {
  proveNonIsomorphicSameStateProvenanceRefresh,
} from './physical-state-same-state-admissibility';

const scope = { organizationId: 'org', vehicleId: 'veh', provider: 'DIMO' };
const binding = 'DIMO:device:abc';

function baseComparison(overrides: Record<string, unknown> = {}) {
  return {
    scope,
    bindingKey: binding,
    legacyBindingKey: binding,
    physicalBindingKey: binding,
    legacyDecision: {
      accepted: false,
      reason: 'no_open_episode',
      gate: PhysicalStateCanonicalGate.LEGACY as PhysicalStateCanonicalGate.LEGACY,
    },
    physicalDecision: {
      accepted: true,
      reason: 'newer_provenance_same_state',
      gate: PhysicalStateCanonicalGate.PHYSICAL as PhysicalStateCanonicalGate.PHYSICAL,
      transitionDecision: DeviceConnectionPhysicalTransitionDecision.PROVENANCE_REFRESH,
      effectiveState: 'PLUGGED' as const,
    },
    legacyEffectivePlugState: 'plugged' as const,
    evidenceObservedAt: new Date('2026-09-18T10:40:47.000Z'),
    legacyEvidenceObservedAt: new Date('2026-09-16T13:35:50.000Z'),
    evidenceReferenceId: 'vls:v1:obd:2026-09-18T10:40:47.000Z',
    ...overrides,
  };
}

describe('same-state provenance refresh admissibility', () => {
  const T0 = new Date('2026-09-16T13:35:50.000Z');
  const T1 = new Date('2026-09-18T10:40:47.000Z');

  it('P1A — snapshot PLUG strictly newer, legacy no_open_episode', () => {
    const previous = {
      effectiveState: 'PLUGGED' as const,
      evidenceObservedAt: T0,
      evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
      evidenceReferenceId: 'vls:v1:obd:2026-09-16T13:35:50.000Z',
      stateVersion: 2,
    };
    const incoming = {
      candidateState: 'PLUGGED' as const,
      evidenceObservedAt: T1,
      evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
      evidenceReferenceId: 'vls:v1:obd:2026-09-18T10:40:47.000Z',
    };
    const proof = proveNonIsomorphicSameStateProvenanceRefresh({
      comparison: baseComparison(),
      previousProjection: previous,
      incoming,
    });
    expect(proof?.variant).toBe('SNAPSHOT_PLUG_NO_OPEN_EPISODE_STRICTLY_NEWER');
    const result = comparePhysicalStateShadowDecisions({
      ...baseComparison(),
      sameStateRefresh: { previousProjection: previous, incoming },
    });
    expect(result.classification).toBe(
      PhysicalStateShadowClassification.NON_ISOMORPHIC_SAME_STATE_PROVENANCE_REFRESH,
    );
    expect(result.correctnessBlocking).toBe(false);
  });

  it('P1B — equal timestamp, different reference/source => proven refresh', () => {
    const t = new Date('2026-09-21T16:05:44.000Z');
    const previous = {
      effectiveState: 'PLUGGED' as const,
      evidenceObservedAt: t,
      evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
      evidenceReferenceId: 'webhook:veh:2026-09-21T16:05:44.000Z:plug',
      stateVersion: 10,
    };
    const incoming = {
      candidateState: 'PLUGGED' as const,
      evidenceObservedAt: t,
      evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
      evidenceReferenceId: 'vls:v1:obd:2026-09-21T16:05:44.000Z',
    };
    const transition = evaluatePhysicalStateTransition({ current: previous, incoming });
    expect(transition.decision).toBe(DeviceConnectionPhysicalTransitionDecision.PROVENANCE_REFRESH);
    const result = comparePhysicalStateShadowDecisions({
      ...baseComparison({
        legacyDecision: {
          accepted: false,
          reason: 'no_open_episode',
          gate: PhysicalStateCanonicalGate.LEGACY,
        },
        evidenceObservedAt: t,
      }),
      sameStateRefresh: { previousProjection: previous, incoming },
    });
    expect(result.classification).toBe(
      PhysicalStateShadowClassification.NON_ISOMORPHIC_SAME_STATE_PROVENANCE_REFRESH,
    );
  });

  it('P1B guard — same instant duplicate is not admissible refresh', () => {
    const t = new Date('2026-09-21T16:05:44.000Z');
    const previous = {
      effectiveState: 'PLUGGED' as const,
      evidenceObservedAt: t,
      evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
      evidenceReferenceId: 'vls:v1:obd:2026-09-21T16:05:44.000Z',
      stateVersion: 10,
    };
    const incoming = { ...previous, candidateState: 'PLUGGED' as const };
    const transition = evaluatePhysicalStateTransition({ current: previous, incoming });
    expect(transition.decision).toBe(DeviceConnectionPhysicalTransitionDecision.DUPLICATE);
    const proof = proveNonIsomorphicSameStateProvenanceRefresh({
      comparison: baseComparison(),
      previousProjection: previous,
      incoming,
    });
    expect(proof).toBeNull();
  });

  it('P2 — webhook PLUG same-state, legacy no_state_change', () => {
    const t0 = new Date('2026-09-23T10:02:56.000Z');
    const t1 = new Date('2026-09-23T10:03:10.000Z');
    const previous = {
      effectiveState: 'PLUGGED' as const,
      evidenceObservedAt: t0,
      evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
      evidenceReferenceId: 'webhook:veh:2026-09-23T10:02:56.000Z:plug',
      stateVersion: 20,
    };
    const incoming = {
      candidateState: 'PLUGGED' as const,
      evidenceObservedAt: t1,
      evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
      evidenceReferenceId: 'webhook:veh:2026-09-23T10:03:10.000Z:plug',
    };
    const result = comparePhysicalStateShadowDecisions({
      ...baseComparison({
        legacyDecision: {
          accepted: false,
          reason: 'no_state_change',
          gate: PhysicalStateCanonicalGate.LEGACY,
        },
        evidenceObservedAt: t1,
      }),
      sameStateRefresh: { previousProjection: previous, incoming },
    });
    expect(result.classification).toBe(
      PhysicalStateShadowClassification.NON_ISOMORPHIC_SAME_STATE_PROVENANCE_REFRESH,
    );
  });

  it('P3 — snapshot UNPLUGGED same-state, legacy obd_false', () => {
    const t = new Date('2026-09-23T07:41:53.000Z');
    const previous = {
      effectiveState: 'UNPLUGGED' as const,
      evidenceObservedAt: t,
      evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
      evidenceReferenceId: 'webhook:veh:2026-09-23T07:41:53.000Z:unplug',
      stateVersion: 30,
    };
    const incoming = {
      candidateState: 'UNPLUGGED' as const,
      evidenceObservedAt: t,
      evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
      evidenceReferenceId: 'vls:v1:obd:2026-09-23T07:41:53.000Z',
    };
    const result = comparePhysicalStateShadowDecisions({
      ...baseComparison({
        legacyDecision: {
          accepted: false,
          reason: 'obd_false',
          gate: PhysicalStateCanonicalGate.LEGACY,
        },
        physicalDecision: {
          accepted: true,
          reason: 'provenance_refresh_same_state',
          gate: PhysicalStateCanonicalGate.PHYSICAL,
          transitionDecision: DeviceConnectionPhysicalTransitionDecision.PROVENANCE_REFRESH,
          effectiveState: 'UNPLUGGED',
        },
        legacyEffectivePlugState: 'unplugged',
        evidenceObservedAt: t,
      }),
      sameStateRefresh: { previousProjection: previous, incoming },
    });
    expect(result.classification).toBe(
      PhysicalStateShadowClassification.NON_ISOMORPHIC_SAME_STATE_PROVENANCE_REFRESH,
    );
  });

  it('WOB sequence — PLUG refresh then UNPLUG APPLIED', () => {
    const plugAt = new Date('2026-09-23T07:41:49.000Z');
    const unplugAt = new Date('2026-09-23T07:41:53.000Z');
    let current = {
      effectiveState: 'PLUGGED' as const,
      evidenceObservedAt: new Date('2026-09-23T07:00:00.000Z'),
      evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
      evidenceReferenceId: 'webhook:veh:2026-09-23T07:00:00.000Z:plug',
      stateVersion: 40,
    };
    const plugIncoming = {
      candidateState: 'PLUGGED' as const,
      evidenceObservedAt: plugAt,
      evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
      evidenceReferenceId: 'webhook:veh:2026-09-23T07:41:49.000Z:plug',
    };
    const plugTransition = evaluatePhysicalStateTransition({
      current,
      incoming: plugIncoming,
    });
    expect(plugTransition.decision).toBe(DeviceConnectionPhysicalTransitionDecision.PROVENANCE_REFRESH);
    const plugShadow = comparePhysicalStateShadowDecisions({
      ...baseComparison({
        legacyDecision: {
          accepted: false,
          reason: 'no_state_change',
          gate: PhysicalStateCanonicalGate.LEGACY,
        },
        evidenceObservedAt: plugAt,
        evidenceReferenceId: plugIncoming.evidenceReferenceId,
      }),
      sameStateRefresh: { previousProjection: current, incoming: plugIncoming },
    });
    expect(plugShadow.classification).toBe(
      PhysicalStateShadowClassification.NON_ISOMORPHIC_SAME_STATE_PROVENANCE_REFRESH,
    );

    current = {
      ...current,
      evidenceObservedAt: plugAt,
      evidenceReferenceId: plugIncoming.evidenceReferenceId,
      stateVersion: 41,
    };
    const unplugIncoming = {
      candidateState: 'UNPLUGGED' as const,
      evidenceObservedAt: unplugAt,
      evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
      evidenceReferenceId: 'webhook:veh:2026-09-23T07:41:53.000Z:unplug',
    };
    const unplugTransition = evaluatePhysicalStateTransition({
      current,
      incoming: unplugIncoming,
    });
    expect(unplugTransition.decision).toBe(DeviceConnectionPhysicalTransitionDecision.APPLIED);
    const unplugShadow = comparePhysicalStateShadowDecisions({
      ...baseComparison({
        legacyDecision: {
          accepted: true,
          reason: null,
          gate: PhysicalStateCanonicalGate.LEGACY,
        },
        physicalDecision: {
          accepted: true,
          reason: 'state_transition',
          gate: PhysicalStateCanonicalGate.PHYSICAL,
          transitionDecision: DeviceConnectionPhysicalTransitionDecision.APPLIED,
          effectiveState: 'UNPLUGGED',
        },
        legacyEffectivePlugState: 'unplugged',
        evidenceObservedAt: unplugAt,
        evidenceReferenceId: unplugIncoming.evidenceReferenceId,
      }),
      sameStateRefresh: { previousProjection: current, incoming: unplugIncoming },
      provenExpectedFix: false,
    });
    expect(unplugShadow.classification).not.toBe(
      PhysicalStateShadowClassification.NON_ISOMORPHIC_SAME_STATE_PROVENANCE_REFRESH,
    );
  });

  it('equal-time opposing state remains CONFLICT blocking', () => {
    const t = new Date('2026-09-21T16:05:44.000Z');
    const result = comparePhysicalStateShadowDecisions({
      ...baseComparison({
        equalTimeOpposingState: true,
        physicalDecision: {
          accepted: false,
          reason: 'equal_timestamp_conflicting_state',
          gate: PhysicalStateCanonicalGate.PHYSICAL,
          transitionDecision: DeviceConnectionPhysicalTransitionDecision.CONFLICT,
          effectiveState: 'PLUGGED',
        },
        evidenceObservedAt: t,
      }),
      sameStateRefresh: {
        previousProjection: {
          effectiveState: 'UNPLUGGED',
          evidenceObservedAt: t,
          evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
          evidenceReferenceId: 'vls:a:obd:x',
          stateVersion: 1,
        },
        incoming: {
          candidateState: 'PLUGGED',
          evidenceObservedAt: t,
          evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
          evidenceReferenceId: 'vls:b:obd:x',
        },
      },
    });
    expect(result.classification).toBe(PhysicalStateShadowClassification.CONFLICT);
    expect(result.correctnessBlocking).toBe(true);
  });
});
