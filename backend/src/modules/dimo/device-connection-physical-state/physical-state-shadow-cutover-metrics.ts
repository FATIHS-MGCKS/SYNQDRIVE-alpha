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
  /** Every row where correctnessBlocking === true (canonical cutover gate numerator). */
  correctnessBlockingTotal: number;
  blockingClassificationCounts: Record<string, number>;
  provenNonIsomorphicSameStateRefresh: number;
  unprovenSameStateRefresh: number;
  trueStateDisagreement: number;
  bindingDivergenceBlocking: number;
  conflictBlocking: number;
  unexplainedOldRejectNewAcceptBlocking: number;
  unexplainedOldAcceptNewRejectBlocking: number;
  /** @deprecated Use correctnessBlockingTotal + blockingClassificationCounts */
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

  if (blocking) {
    snapshot.correctnessBlockingTotal += 1;
    snapshot.blockingClassificationCounts[cls] =
      (snapshot.blockingClassificationCounts[cls] ?? 0) + 1;
  }

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
  }

  if (cls === PhysicalStateShadowClassification.UNEXPLAINED_OLD_REJECT_NEW_ACCEPT && blocking) {
    snapshot.unexplainedOldRejectNewAcceptBlocking += 1;
    snapshot.correctnessBlockingUnexplained += 1;
  }
  if (cls === PhysicalStateShadowClassification.UNEXPLAINED_OLD_ACCEPT_NEW_REJECT && blocking) {
    snapshot.unexplainedOldAcceptNewRejectBlocking += 1;
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
    correctnessBlockingTotal: 0,
    blockingClassificationCounts: {},
    provenNonIsomorphicSameStateRefresh: 0,
    unprovenSameStateRefresh: 0,
    trueStateDisagreement: 0,
    bindingDivergenceBlocking: 0,
    conflictBlocking: 0,
    unexplainedOldRejectNewAcceptBlocking: 0,
    unexplainedOldAcceptNewRejectBlocking: 0,
    correctnessBlockingUnexplained: 0,
  };
}

export function isStaleAuthorityMutation(decision: string | null | undefined): boolean {
  return decision === DeviceConnectionPhysicalTransitionDecision.STALE;
}
