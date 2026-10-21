import { RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION } from './raw-refuel-candidate-cross-version-compatibility.authority';
import { tryBuildCandidateIdentityKeyFromEvidence } from './raw-refuel-candidate-identity-key';
import {
  RAW_REFUEL_CANDIDATE_PRE_PLATEAU_TOLERANCE_LITERS,
  RAW_REFUEL_CANDIDATE_PRE_PLATEAU_TOLERANCE_PERCENT,
  RAW_REFUEL_CANDIDATE_RISE_NEIGHBORHOOD_MS,
} from './raw-refuel-candidate.constants';
import {
  parsePostFuelAuthorityFromEvidenceMeta,
  resolveStoredEffectivePostFuelAuthority,
} from './raw-refuel-candidate-post-fuel-authority.resolver';
import type { RawRefuelCandidateOverlapClassification } from './raw-refuel-candidate.types';
import type { RawRefuelCandidateEvidenceSlice } from './raw-refuel-candidate.types';
import { readBaselineRecencyFromEvidenceMeta } from '../raw-fuel-rise-detector/raw-fuel-pre-plateau-baseline-recency.policy';

function msBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime());
}

function withinTolerance(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance;
}

function windowsOverlap(
  aStart: Date | null | undefined,
  aEnd: Date | null | undefined,
  bStart: Date | null | undefined,
  bEnd: Date | null | undefined,
): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart <= bEnd && bStart <= aEnd;
}

function physicalNeighborhoodCorresponds(
  observation: RawRefuelCandidateEvidenceSlice,
  candidate: RawRefuelCandidateEvidenceSlice,
): boolean {
  const obsRise = observation.riseOnsetAt;
  const candRise = candidate.riseOnsetAt;
  return (
    windowsOverlap(
      observation.physicalEvidenceStart,
      observation.physicalEvidenceEnd,
      candidate.physicalEvidenceStart,
      candidate.physicalEvidenceEnd,
    ) ||
    (obsRise != null &&
      candRise != null &&
      msBetween(obsRise, candRise) <= RAW_REFUEL_CANDIDATE_RISE_NEIGHBORHOOD_MS)
  );
}

function hasCompatiblePrePlateau(
  left: RawRefuelCandidateEvidenceSlice,
  right: RawRefuelCandidateEvidenceSlice,
): boolean | null {
  if (left.signalChannel === 'ABSOLUTE_LITERS') {
    if (left.preFuelAbsoluteLiters == null || right.preFuelAbsoluteLiters == null) {
      return null;
    }
    return withinTolerance(
      left.preFuelAbsoluteLiters,
      right.preFuelAbsoluteLiters,
      RAW_REFUEL_CANDIDATE_PRE_PLATEAU_TOLERANCE_LITERS,
    );
  }
  if (left.preFuelRelativePercent == null || right.preFuelRelativePercent == null) {
    return null;
  }
  return withinTolerance(
    left.preFuelRelativePercent,
    right.preFuelRelativePercent,
    RAW_REFUEL_CANDIDATE_PRE_PLATEAU_TOLERANCE_PERCENT,
  );
}

function hasCompatibleRiseEpisodeAnchors(
  observation: RawRefuelCandidateEvidenceSlice,
  candidate: RawRefuelCandidateEvidenceSlice,
): boolean | null {
  const obsRise = observation.riseOnsetAt;
  const candRise = candidate.riseOnsetAt;
  const obsEnd = observation.riseEndAt;
  const candEnd = candidate.riseEndAt;
  if (obsRise == null || candRise == null || obsEnd == null || candEnd == null) {
    return null;
  }
  if (msBetween(obsRise, candRise) > RAW_REFUEL_CANDIDATE_RISE_NEIGHBORHOOD_MS) {
    return false;
  }
  return msBetween(obsEnd, candEnd) <= RAW_REFUEL_CANDIDATE_RISE_NEIGHBORHOOD_MS;
}

function hasCompatibleFreshPreBaseline(
  observation: RawRefuelCandidateEvidenceSlice,
  candidate: RawRefuelCandidateEvidenceSlice,
): boolean | null {
  const obsBaseline = readBaselineRecencyFromEvidenceMeta(observation.evidenceMeta);
  const candBaseline = readBaselineRecencyFromEvidenceMeta(candidate.evidenceMeta);
  if (obsBaseline == null) {
    return null;
  }
  if (obsBaseline !== 'FRESH') {
    return false;
  }
  if (candBaseline == null) {
    return null;
  }
  if (candBaseline === 'STALE') {
    return false;
  }
  return candBaseline === 'FRESH';
}

function physicalIdentityKeysMatch(
  observation: RawRefuelCandidateEvidenceSlice,
  candidate: RawRefuelCandidateEvidenceSlice,
): boolean | null {
  const obsKey = tryBuildCandidateIdentityKeyFromEvidence({
    vehicleId: observation.vehicleId,
    detectionVersion: RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
    signalChannel: observation.signalChannel,
    riseOnsetAt: observation.riseOnsetAt,
    preFuelAbsoluteLiters: observation.preFuelAbsoluteLiters,
    preFuelRelativePercent: observation.preFuelRelativePercent,
  });
  const candKey = tryBuildCandidateIdentityKeyFromEvidence({
    vehicleId: candidate.vehicleId,
    detectionVersion: RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
    signalChannel: candidate.signalChannel,
    riseOnsetAt: candidate.riseOnsetAt,
    preFuelAbsoluteLiters: candidate.preFuelAbsoluteLiters,
    preFuelRelativePercent: candidate.preFuelRelativePercent,
  });
  if (obsKey == null || candKey == null) {
    return null;
  }
  return obsKey === candKey;
}

export function bothExplicitSettledMedianPostFuelAuthority(
  observation: RawRefuelCandidateEvidenceSlice,
  candidate: RawRefuelCandidateEvidenceSlice,
): boolean {
  const observationAuthority = parsePostFuelAuthorityFromEvidenceMeta(observation.evidenceMeta);
  const storedAuthority = resolveStoredEffectivePostFuelAuthority({
    storedDetectionVersion: candidate.detectionVersion,
    evidenceMeta: candidate.evidenceMeta,
  });
  return observationAuthority === 'SETTLED_MEDIAN' && storedAuthority === 'SETTLED_MEDIAN';
}

export type V2DetectionVersionCarrier = {
  detectionVersion: string | null | undefined;
};

export function isV2SameVersionPair(
  observation: V2DetectionVersionCarrier,
  candidate: V2DetectionVersionCarrier,
): boolean {
  return (
    observation.detectionVersion === RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION &&
    candidate.detectionVersion === RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION
  );
}

function hasCompatiblePrePlateauForAmbiguityGuard(
  left: RawRefuelCandidateEvidenceSlice,
  right: RawRefuelCandidateEvidenceSlice,
): boolean {
  if (left.signalChannel === 'ABSOLUTE_LITERS') {
    if (left.preFuelAbsoluteLiters == null || right.preFuelAbsoluteLiters == null) {
      return false;
    }
    return (
      Math.abs(left.preFuelAbsoluteLiters - right.preFuelAbsoluteLiters) <=
      RAW_REFUEL_CANDIDATE_PRE_PLATEAU_TOLERANCE_LITERS
    );
  }
  if (left.preFuelRelativePercent == null || right.preFuelRelativePercent == null) {
    return false;
  }
  return (
    Math.abs(left.preFuelRelativePercent - right.preFuelRelativePercent) <=
    RAW_REFUEL_CANDIDATE_PRE_PLATEAU_TOLERANCE_PERCENT
  );
}

/**
 * Fail-closed when a shifted identity bucket plus stale/missing baseline would otherwise
 * fork a second candidate for the same physical rise neighborhood.
 */
export function isV2ShiftedIdentityBucketStaleAmbiguity(
  observation: RawRefuelCandidateEvidenceSlice,
  candidate: RawRefuelCandidateEvidenceSlice,
): boolean {
  if (!isV2SameVersionPair(observation, candidate)) {
    return false;
  }
  if (!bothExplicitSettledMedianPostFuelAuthority(observation, candidate)) {
    return false;
  }
  if (!hasCompatiblePrePlateauForAmbiguityGuard(observation, candidate)) {
    return false;
  }
  if (!physicalNeighborhoodCorresponds(observation, candidate)) {
    return false;
  }

  const obsBaseline = readBaselineRecencyFromEvidenceMeta(observation.evidenceMeta);
  const candBaseline = readBaselineRecencyFromEvidenceMeta(candidate.evidenceMeta);
  const baselineUncertain =
    obsBaseline !== 'FRESH' || candBaseline !== 'FRESH';
  if (!baselineUncertain) {
    return false;
  }

  const identityMatch = physicalIdentityKeysMatch(observation, candidate);
  return identityMatch === false;
}

/**
 * R3B settled-median v2→v2 reconciliation only — both sides must explicitly declare
 * SETTLED_MEDIAN before this path is invoked. Fail-closed on ambiguity.
 */
export function classifyV2SettledMedianPhysicalRediscoveryOverlap(
  observation: RawRefuelCandidateEvidenceSlice,
  candidate: RawRefuelCandidateEvidenceSlice,
): RawRefuelCandidateOverlapClassification {
  if (!bothExplicitSettledMedianPostFuelAuthority(observation, candidate)) {
    return 'INSUFFICIENT_EVIDENCE';
  }
  const preCompatible = hasCompatiblePrePlateau(observation, candidate);
  if (preCompatible === false) {
    return 'DISTINCT_PHYSICAL_RISE';
  }
  if (preCompatible !== true) {
    return 'INSUFFICIENT_EVIDENCE';
  }

  if (!physicalNeighborhoodCorresponds(observation, candidate)) {
    return 'DISTINCT_PHYSICAL_RISE';
  }

  const riseEpisode = hasCompatibleRiseEpisodeAnchors(observation, candidate);
  if (riseEpisode === false) {
    return 'DISTINCT_PHYSICAL_RISE';
  }
  if (riseEpisode !== true) {
    return 'INSUFFICIENT_EVIDENCE';
  }

  const freshBaseline = hasCompatibleFreshPreBaseline(observation, candidate);
  if (freshBaseline === false) {
    return 'DISTINCT_PHYSICAL_RISE';
  }
  if (freshBaseline !== true) {
    return 'INSUFFICIENT_EVIDENCE';
  }

  const identityMatch = physicalIdentityKeysMatch(observation, candidate);
  if (identityMatch === false) {
    return 'DISTINCT_PHYSICAL_RISE';
  }
  if (identityMatch !== true) {
    return 'INSUFFICIENT_EVIDENCE';
  }

  return 'SAME_PHYSICAL_RISE';
}
