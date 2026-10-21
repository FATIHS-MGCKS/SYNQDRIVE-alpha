import { DeviceConnectionPhysicalAuthorityMode } from '@prisma/client';
import { PhysicalStateCanonicalGate } from './physical-state-authority.types';
import { PhysicalStateShadowClassification } from './physical-state-shadow.classification';
import {
  accumulateShadowCutoverMetrics,
  createEmptyShadowCutoverMetricSnapshot,
} from './physical-state-shadow-cutover-metrics';
import type { PhysicalStateShadowComparisonResult } from './physical-state-shadow-comparator.types';

function blockingRow(
  classification: PhysicalStateShadowClassification,
  correctnessBlocking: boolean,
): PhysicalStateShadowComparisonResult {
  return {
    classification,
    comparisonDomain: 'STATE_TRANSITION',
    correctnessBlocking,
    authorityMode: DeviceConnectionPhysicalAuthorityMode.PHYSICAL,
    legacyDecision: {
      accepted: !correctnessBlocking,
      reason: 'x',
      gate: PhysicalStateCanonicalGate.LEGACY,
    },
    physicalDecision: {
      accepted: true,
      reason: 'y',
      gate: PhysicalStateCanonicalGate.PHYSICAL,
      transitionDecision: 'APPLIED',
      effectiveState: 'PLUGGED',
    },
    scope: { organizationId: 'org', vehicleId: 'veh', provider: 'DIMO' },
    bindingKey: 'bind',
    legacyReason: 'x',
    physicalReason: 'y',
    legacyEffectivePlugState: 'plugged',
    physicalEffectiveState: 'PLUGGED',
    evidenceObservedAt: '2026-09-20T10:00:00.000Z',
    legacyEvidenceObservedAt: '2026-09-20T09:00:00.000Z',
    correlationId: null,
    evidenceReferenceId: 'ref',
    observedAt: '2026-09-20T10:00:01.000Z',
    provenSameStateRefreshVariant: null,
  };
}

describe('accumulateShadowCutoverMetrics — correctnessBlockingTotal', () => {
  it('counts every correctnessBlocking row regardless of classification subtype counter', () => {
    const snap = createEmptyShadowCutoverMetricSnapshot();
    const classes = [
      PhysicalStateShadowClassification.UNEXPLAINED_OLD_REJECT_NEW_ACCEPT,
      PhysicalStateShadowClassification.UNEXPLAINED_OLD_ACCEPT_NEW_REJECT,
      PhysicalStateShadowClassification.STATE_DIVERGENCE_CORRECTNESS_UNKNOWN,
      PhysicalStateShadowClassification.BINDING_DIVERGENCE,
      PhysicalStateShadowClassification.CONFLICT,
    ];

    for (const cls of classes) {
      accumulateShadowCutoverMetrics(snap, blockingRow(cls, true));
    }
    accumulateShadowCutoverMetrics(
      snap,
      blockingRow(PhysicalStateShadowClassification.NON_ISOMORPHIC_SAME_STATE_PROVENANCE_REFRESH, false),
    );

    expect(snap.correctnessBlockingTotal).toBe(5);
    expect(Object.values(snap.blockingClassificationCounts).reduce((a, b) => a + b, 0)).toBe(5);
  });
});
