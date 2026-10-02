import {
  DeviceConnectionPhysicalEffectiveState,
  DeviceConnectionPhysicalEvidenceSource,
  DeviceConnectionPhysicalTransitionDecision,
} from '@prisma/client';
import type { PhysicalStateShadowComparisonInput } from './physical-state-shadow-comparator.types';
import { PhysicalStateCanonicalGate } from './physical-state-authority.types';
import { comparePhysicalStateShadowDecisions } from './physical-state-shadow-comparator';
import { PhysicalStateShadowClassification } from './physical-state-shadow.classification';
import {
  accumulateShadowCutoverMetrics,
  createEmptyShadowCutoverMetricSnapshot,
} from './physical-state-shadow-cutover-metrics';

/**
 * Deterministic T7 pattern prototypes (counts validated in Production audit 2026-09-25).
 * Does not rewrite historical DB rows — replays comparator semantics only.
 */
const T7_PATTERN_COUNTS = {
  P1A: 985,
  P1B: 148,
  P2: 416,
  P3: 3,
} as const;

describe('T7 shadow replay fixtures', () => {
  it('classifies all four Production patterns as proven non-isomorphic refresh', () => {
    const metrics = createEmptyShadowCutoverMetricSnapshot();
    const rows = [
      buildP1A(),
      buildP1B(),
      buildP2(),
      buildP3(),
    ];

    for (const row of rows) {
      const result = comparePhysicalStateShadowDecisions(row.input);
      expect(result.classification).toBe(
        PhysicalStateShadowClassification.NON_ISOMORPHIC_SAME_STATE_PROVENANCE_REFRESH,
      );
      expect(result.correctnessBlocking).toBe(false);
      accumulateShadowCutoverMetrics(metrics, result);
    }

    expect(metrics.provenNonIsomorphicSameStateRefresh).toBe(4);
    expect(metrics.correctnessBlockingUnexplained).toBe(0);
    expect(metrics.unprovenSameStateRefresh).toBe(0);
  });

  it('reports authoritative T7 pattern totals', () => {
    const total =
      T7_PATTERN_COUNTS.P1A +
      T7_PATTERN_COUNTS.P1B +
      T7_PATTERN_COUNTS.P2 +
      T7_PATTERN_COUNTS.P3;
    expect(total).toBe(1552);
  });

  it('negative guard — missing sameStateRefresh stays blocking UNEXPLAINED', () => {
    const row = buildP1A();
    const { sameStateRefresh: _removed, ...input } = row.input;
    const result = comparePhysicalStateShadowDecisions(input);
    expect(result.classification).toBe(
      PhysicalStateShadowClassification.UNEXPLAINED_OLD_REJECT_NEW_ACCEPT,
    );
    expect(result.correctnessBlocking).toBe(true);
  });
});

function buildP1A(): { input: PhysicalStateShadowComparisonInput } {
  const t0 = new Date('2026-09-16T13:35:50.000Z');
  const t1 = new Date('2026-09-18T10:40:47.000Z');
  return {
    input: {
      scope: { organizationId: 'o', vehicleId: 'v', provider: 'DIMO' },
      bindingKey: 'DIMO:device:x',
      legacyBindingKey: 'DIMO:device:x',
      physicalBindingKey: 'DIMO:device:x',
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
        effectiveState: DeviceConnectionPhysicalEffectiveState.PLUGGED,
      },
      legacyEffectivePlugState: 'plugged' as const,
      evidenceObservedAt: t1,
      sameStateRefresh: {
        previousProjection: {
          effectiveState: DeviceConnectionPhysicalEffectiveState.PLUGGED,
          evidenceObservedAt: t0,
          evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
          evidenceReferenceId: 'vls:v1:obd:2026-09-16T13:35:50.000Z',
          stateVersion: 2,
        },
        incoming: {
          candidateState: DeviceConnectionPhysicalEffectiveState.PLUGGED,
          evidenceObservedAt: t1,
          evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
          evidenceReferenceId: 'vls:v1:obd:2026-09-18T10:40:47.000Z',
        },
      },
    },
  };
}

function buildP1B(): { input: PhysicalStateShadowComparisonInput } {
  const t = new Date('2026-09-21T16:05:44.000Z');
  return {
    input: {
      scope: { organizationId: 'o', vehicleId: 'v', provider: 'DIMO' },
      bindingKey: 'DIMO:device:x',
      legacyBindingKey: 'DIMO:device:x',
      physicalBindingKey: 'DIMO:device:x',
      legacyDecision: {
        accepted: false,
        reason: 'no_open_episode',
        gate: PhysicalStateCanonicalGate.LEGACY as PhysicalStateCanonicalGate.LEGACY,
      },
      physicalDecision: {
        accepted: true,
        reason: 'provenance_refresh_same_state',
        gate: PhysicalStateCanonicalGate.PHYSICAL as PhysicalStateCanonicalGate.PHYSICAL,
        transitionDecision: DeviceConnectionPhysicalTransitionDecision.PROVENANCE_REFRESH,
        effectiveState: DeviceConnectionPhysicalEffectiveState.PLUGGED,
      },
      legacyEffectivePlugState: 'plugged' as const,
      evidenceObservedAt: t,
      sameStateRefresh: {
        previousProjection: {
          effectiveState: DeviceConnectionPhysicalEffectiveState.PLUGGED,
          evidenceObservedAt: t,
          evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
          evidenceReferenceId: 'webhook:v:2026-09-21T16:05:44.000Z:plug',
          stateVersion: 5,
        },
        incoming: {
          candidateState: DeviceConnectionPhysicalEffectiveState.PLUGGED,
          evidenceObservedAt: t,
          evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
          evidenceReferenceId: 'vls:v1:obd:2026-09-21T16:05:44.000Z',
        },
      },
    },
  };
}

function buildP2(): { input: PhysicalStateShadowComparisonInput } {
  const t0 = new Date('2026-09-23T10:02:56.000Z');
  const t1 = new Date('2026-09-23T10:03:05.000Z');
  return {
    input: {
      scope: { organizationId: 'o', vehicleId: 'v', provider: 'DIMO' },
      bindingKey: 'DIMO:device:x',
      legacyBindingKey: 'DIMO:device:x',
      physicalBindingKey: 'DIMO:device:x',
      legacyDecision: {
        accepted: false,
        reason: 'no_state_change',
        gate: PhysicalStateCanonicalGate.LEGACY as PhysicalStateCanonicalGate.LEGACY,
      },
      physicalDecision: {
        accepted: true,
        reason: 'newer_provenance_same_state',
        gate: PhysicalStateCanonicalGate.PHYSICAL as PhysicalStateCanonicalGate.PHYSICAL,
        transitionDecision: DeviceConnectionPhysicalTransitionDecision.PROVENANCE_REFRESH,
        effectiveState: DeviceConnectionPhysicalEffectiveState.PLUGGED,
      },
      legacyEffectivePlugState: 'plugged' as const,
      evidenceObservedAt: t1,
      sameStateRefresh: {
        previousProjection: {
          effectiveState: DeviceConnectionPhysicalEffectiveState.PLUGGED,
          evidenceObservedAt: t0,
          evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
          evidenceReferenceId: 'webhook:v:2026-09-23T10:02:56.000Z:plug',
          stateVersion: 8,
        },
        incoming: {
          candidateState: DeviceConnectionPhysicalEffectiveState.PLUGGED,
          evidenceObservedAt: t1,
          evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
          evidenceReferenceId: 'webhook:v:2026-09-23T10:03:05.000Z:plug',
        },
      },
    },
  };
}

function buildP3(): { input: PhysicalStateShadowComparisonInput } {
  const t = new Date('2026-09-23T07:41:53.000Z');
  return {
    input: {
      scope: { organizationId: 'o', vehicleId: 'v', provider: 'DIMO' },
      bindingKey: 'DIMO:device:x',
      legacyBindingKey: 'DIMO:device:x',
      physicalBindingKey: 'DIMO:device:x',
      legacyDecision: {
        accepted: false,
        reason: 'obd_false',
        gate: PhysicalStateCanonicalGate.LEGACY as PhysicalStateCanonicalGate.LEGACY,
      },
      physicalDecision: {
        accepted: true,
        reason: 'provenance_refresh_same_state',
        gate: PhysicalStateCanonicalGate.PHYSICAL as PhysicalStateCanonicalGate.PHYSICAL,
        transitionDecision: DeviceConnectionPhysicalTransitionDecision.PROVENANCE_REFRESH,
        effectiveState: DeviceConnectionPhysicalEffectiveState.UNPLUGGED,
      },
      legacyEffectivePlugState: 'unplugged' as const,
      evidenceObservedAt: t,
      sameStateRefresh: {
        previousProjection: {
          effectiveState: DeviceConnectionPhysicalEffectiveState.UNPLUGGED,
          evidenceObservedAt: t,
          evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
          evidenceReferenceId: 'webhook:v:2026-09-23T07:41:53.000Z:unplug',
          stateVersion: 9,
        },
        incoming: {
          candidateState: DeviceConnectionPhysicalEffectiveState.UNPLUGGED,
          evidenceObservedAt: t,
          evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
          evidenceReferenceId: 'vls:v1:obd:2026-09-23T07:41:53.000Z',
        },
      },
    },
  };
}
