import type { RawRefuelCandidate } from '@prisma/client';
import type { RefuelRowForMatcher } from '../physical-refuel-identity.matcher';
import { classifyPhysicalRefuelSibling } from '../physical-refuel-identity.matcher';
import { mapRawRefuelCandidateToPromotionDraft } from '../raw-refuel-candidate/raw-refuel-candidate-promotion.design';
import type {
  RawRefuelNativeOverlapAdvisoryClassification,
  RawRefuelNativeOverlapAdvisoryResult,
  RawRefuelNativeOverlapSiblingAssessment,
} from './raw-refuel-native-overlap.types';

/** Map persisted candidate → G2 matcher row (advisory only). */
export function rawRefuelCandidateToRefuelRowForMatcher(
  candidate: RawRefuelCandidate,
): RefuelRowForMatcher {
  const draft = mapRawRefuelCandidateToPromotionDraft(candidate);
  return {
    id: candidate.id,
    vehicleId: candidate.vehicleId,
    kind: 'REFUEL',
    startTime: draft.startTime.toISOString(),
    endTime: draft.endTime.toISOString(),
    fuelStartLiters: candidate.preFuelAbsoluteLiters,
    fuelEndLiters: candidate.postFuelAbsoluteLiters,
    fuelStartPercent: candidate.preFuelRelativePercent,
    fuelEndPercent: candidate.postFuelRelativePercent,
    fuelDeltaLiters: candidate.deltaAbsoluteLiters,
    fuelDeltaPercent: candidate.deltaRelativePercent,
    durationSeconds: draft.durationSeconds,
    odometerEndKm: null,
    dimoSegmentId: draft.dimoSegmentIdPlaceholder,
  };
}

export interface ClassifyRawRefuelNativeOverlapInput {
  candidate: RawRefuelCandidate;
  nativeRefuelRows: RefuelRowForMatcher[];
}

/**
 * F4 advisory native-overlap inspection — does NOT terminal-reject candidate.
 * Reuses canonical G2 classifyPhysicalRefuelSibling().
 */
export function classifyRawRefuelNativeOverlapAdvisory(
  input: ClassifyRawRefuelNativeOverlapInput,
): RawRefuelNativeOverlapAdvisoryResult {
  const candidateRow = rawRefuelCandidateToRefuelRowForMatcher(input.candidate);
  const siblingAssessments: RawRefuelNativeOverlapSiblingAssessment[] = [];
  const sameNativeEventIds: string[] = [];
  const distinctNativeEventIds: string[] = [];
  const insufficientNativeEventIds: string[] = [];

  for (const nativeRow of input.nativeRefuelRows) {
    if (nativeRow.vehicleId !== input.candidate.vehicleId) {
      continue;
    }
    const result = classifyPhysicalRefuelSibling(candidateRow, nativeRow);
    siblingAssessments.push({
      nativeEventId: nativeRow.id,
      classification: result.classification,
      reason: result.reason,
    });
    if (result.classification === 'SAME_PHYSICAL_REFUEL') {
      sameNativeEventIds.push(nativeRow.id);
    } else if (result.classification === 'DISTINCT_PHYSICAL_REFUEL') {
      distinctNativeEventIds.push(nativeRow.id);
    } else {
      insufficientNativeEventIds.push(nativeRow.id);
    }
  }

  let advisoryClassification: RawRefuelNativeOverlapAdvisoryClassification;
  let detail: string;

  if (input.nativeRefuelRows.length === 0) {
    advisoryClassification = 'NO_NATIVE_SIBLINGS';
    detail = 'no_native_refuel_neighbors';
  } else if (sameNativeEventIds.length > 1) {
    advisoryClassification = 'AMBIGUOUS_MULTIPLE_SAME';
    detail = 'multiple_same_native_siblings';
  } else if (sameNativeEventIds.length === 1) {
    advisoryClassification = 'SAME';
    detail = 'single_same_native_sibling';
  } else if (
    insufficientNativeEventIds.length > 0 &&
    distinctNativeEventIds.length === 0
  ) {
    advisoryClassification = 'INSUFFICIENT_EVIDENCE';
    detail = 'native_neighbors_insufficient_evidence';
  } else if (sameNativeEventIds.length === 0 && insufficientNativeEventIds.length > 0) {
    advisoryClassification = 'INSUFFICIENT_EVIDENCE';
    detail = 'mixed_insufficient_native_neighbors';
  } else {
    advisoryClassification = 'DISTINCT';
    detail = 'native_neighbors_distinct';
  }

  return {
    advisoryClassification,
    siblingAssessments,
    sameNativeEventIds,
    distinctNativeEventIds,
    insufficientNativeEventIds,
    detail,
  };
}

/** Bounded lookback/forward around candidate physical evidence for native sibling queries. */
export const RAW_REFUEL_NATIVE_OVERLAP_QUERY_BUFFER_MS = 2 * 60 * 60 * 1000;

export function computeNativeOverlapQueryWindow(candidate: RawRefuelCandidate): {
  start: Date;
  end: Date;
} {
  const evidenceStart =
    candidate.physicalEvidenceStart ??
    candidate.riseOnsetAt ??
    candidate.scanWindowStart ??
    candidate.firstObservedAt;
  const evidenceEnd =
    candidate.physicalEvidenceEnd ??
    candidate.riseEndAt ??
    candidate.scanWindowEnd ??
    candidate.lastObservedAt;
  return {
    start: new Date(evidenceStart.getTime() - RAW_REFUEL_NATIVE_OVERLAP_QUERY_BUFFER_MS),
    end: new Date(evidenceEnd.getTime() + RAW_REFUEL_NATIVE_OVERLAP_QUERY_BUFFER_MS),
  };
}
