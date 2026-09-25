import { DeviceConnectionPhysicalTransitionDecision } from '@prisma/client';
import {
  isProvenNonIsomorphicSameStateClassification,
  isShadowClassificationCorrectnessBlocking,
  isUnprovenSameStateRefreshClassification,
  PhysicalStateShadowClassification,
} from './physical-state-shadow.classification';
import type { PhysicalStateShadowComparisonResult } from './physical-state-shadow-comparator.types';

export type ShadowCutoverMetricSnapshot = {
  rawClassificationCounts: Record<string, number>;
  domainCounts: Record<string, number>;
  correctnessBlockingCounts: Record<string, number>;
  provenNonIsomorphicSameStateRefresh: number;
  unprovenSameStateRefresh: number;
  trueStateDisagreement: number;
  bindingDivergenceBlocking: number;
  conflictBlocking: number;
  correctnessBlockingUnexplained: number;
};

export function accumulateShadowCutoverMetrics(
  snapshot: ShadowCutoverMetricSnapshot,
  row: PhysicalStateShadowComparisonResult,
): void {
  const cls = row.classification;
  snapshot.rawClassificationCounts[cls] = (snapshot.rawClassificationCounts[cls] ?? 0) + 1;
  snapshot.domainCounts[row.comparisonDomain] =
    (snapshot.domainCounts[row.comparisonDomain] ?? 0) + 1;

  const blocking = row.correctnessBlocking;
  snapshot.correctnessBlockingCounts[String(blocking)] =
    (snapshot.correctnessBlockingCounts[String(blocking)] ?? 0) + 1;

  if (isProvenNonIsomorphicSameStateClassification(cls)) {
    snapshot.provenNonIsomorphicSameStateRefresh += 1;
  }

  if (
    isUnprovenSameStateRefreshClassification(cls, {
      legacyRejected: row.legacyDecision.accepted === false,
      physicalAccepted: row.physicalDecision.accepted === true,
      transitionDecision: row.physicalDecision.transitionDecision ?? null,
    })
  ) {
    snapshot.unprovenSameStateRefresh += 1;
    snapshot.correctnessBlockingUnexplained += 1;
  } else if (
    isShadowClassificationCorrectnessBlocking(cls) &&
    cls === PhysicalStateShadowClassification.UNEXPLAINED_OLD_REJECT_NEW_ACCEPT
  ) {
    snapshot.correctnessBlockingUnexplained += 1;
  }

  if (cls === PhysicalStateShadowClassification.STATE_DIVERGENCE_CORRECTNESS_UNKNOWN) {
    snapshot.trueStateDisagreement += 1;
  }
  if (cls === PhysicalStateShadowClassification.BINDING_DIVERGENCE && blocking) {
    snapshot.bindingDivergenceBlocking += 1;
  }
  if (cls === PhysicalStateShadowClassification.CONFLICT && blocking) {
    snapshot.conflictBlocking += 1;
  }
}

export function createEmptyShadowCutoverMetricSnapshot(): ShadowCutoverMetricSnapshot {
  return {
    rawClassificationCounts: {},
    domainCounts: {},
    correctnessBlockingCounts: {},
    provenNonIsomorphicSameStateRefresh: 0,
    unprovenSameStateRefresh: 0,
    trueStateDisagreement: 0,
    bindingDivergenceBlocking: 0,
    conflictBlocking: 0,
    correctnessBlockingUnexplained: 0,
  };
}

export function isStaleAuthorityMutation(decision: string | null | undefined): boolean {
  return decision === DeviceConnectionPhysicalTransitionDecision.STALE;
}
