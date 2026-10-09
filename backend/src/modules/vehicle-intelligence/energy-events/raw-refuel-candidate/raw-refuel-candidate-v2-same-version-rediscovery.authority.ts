import { RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION } from './raw-refuel-candidate-cross-version-compatibility.authority';
import {
  derivePrePlateauBucketFromObservation,
  tryBuildCandidateIdentityKeyFromEvidence,
} from './raw-refuel-candidate-identity-key';
import {
  RAW_REFUEL_CANDIDATE_POST_PLATEAU_TOLERANCE_LITERS,
  RAW_REFUEL_CANDIDATE_PRE_PLATEAU_TOLERANCE_LITERS,
  RAW_REFUEL_CANDIDATE_PRE_PLATEAU_TOLERANCE_PERCENT,
  RAW_REFUEL_CANDIDATE_RISE_NEIGHBORHOOD_MS,
} from './raw-refuel-candidate.constants';
import {
  resolveObservationPostFuelAuthorityForCrossVersion,
  resolveStoredEffectivePostFuelAuthority,
} from './raw-refuel-candidate-post-fuel-authority.resolver';
import { classifyPostFuelAuthorityTransition } from './raw-refuel-post-fuel-authority.types';
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
): boolean {
  const obsEnd = observation.riseEndAt;
  const candEnd = candidate.riseEndAt;
  if (obsEnd == null || candEnd == null) {
    return true;
  }
  return msBetween(obsEnd, candEnd) <= RAW_REFUEL_CANDIDATE_RISE_NEIGHBORHOOD_MS;
}

function hasCompatibleFreshPreBaseline(
  observation: RawRefuelCandidateEvidenceSlice,
  candidate: RawRefuelCandidateEvidenceSlice,
): boolean | null {
  const obsBaseline = readBaselineRecencyFromEvidenceMeta(observation.evidenceMeta);
  const candBaseline = readBaselineRecencyFromEvidenceMeta(candidate.evidenceMeta);
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

function hasContradictorySettledPostTerminalEvidence(
  observation: RawRefuelCandidateEvidenceSlice,
  candidate: RawRefuelCandidateEvidenceSlice,
): boolean {
  const obsPre = observation.preFuelAbsoluteLiters ?? observation.preFuelRelativePercent;
  const candPre = candidate.preFuelAbsoluteLiters ?? candidate.preFuelRelativePercent;
  const obsPost = observation.postFuelAbsoluteLiters ?? observation.postFuelRelativePercent;
  const candPost = candidate.postFuelAbsoluteLiters ?? candidate.postFuelRelativePercent;
  if (obsPre == null || candPre == null || obsPost == null || candPost == null) {
    return false;
  }
  const obsDelta = obsPost - obsPre;
  const candDelta = candPost - candPre;
  const material =
    observation.signalChannel === 'ABSOLUTE_LITERS'
      ? RAW_REFUEL_CANDIDATE_POST_PLATEAU_TOLERANCE_LITERS * 2
      : RAW_REFUEL_CANDIDATE_PRE_PLATEAU_TOLERANCE_PERCENT * 2;
  if (obsDelta <= 0 || candDelta <= 0) {
    return true;
  }
  if (Math.abs(obsDelta - candDelta) > material * 4) {
    return true;
  }
  const preBucketObs = derivePrePlateauBucketFromObservation(observation);
  const preBucketCand = derivePrePlateauBucketFromObservation(candidate);
  if (preBucketObs != null && preBucketCand != null && preBucketObs !== preBucketCand) {
    return true;
  }
  return false;
}

export function isV2SameVersionPair(
  observation: RawRefuelCandidateEvidenceSlice,
  candidate: RawRefuelCandidateEvidenceSlice,
): boolean {
  return (
    observation.detectionVersion === RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION &&
    candidate.detectionVersion === RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION
  );
}

/**
 * Version-aware v2→v2 reconciliation: revised SETTLED_MEDIAN alone must not fork
 * a second candidate when physical identity is proven. Fail-closed on ambiguity.
 */
export function classifyV2SameVersionRawRefuelCandidateOverlap(
  observation: RawRefuelCandidateEvidenceSlice,
  candidate: RawRefuelCandidateEvidenceSlice,
): RawRefuelCandidateOverlapClassification {
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

  if (!hasCompatibleRiseEpisodeAnchors(observation, candidate)) {
    return 'DISTINCT_PHYSICAL_RISE';
  }

  const observationAuthority = resolveObservationPostFuelAuthorityForCrossVersion(
    observation.evidenceMeta,
  );
  const storedAuthority = resolveStoredEffectivePostFuelAuthority({
    storedDetectionVersion: candidate.detectionVersion,
    evidenceMeta: candidate.evidenceMeta,
  });
  if (observationAuthority == null || storedAuthority == null) {
    return 'INSUFFICIENT_EVIDENCE';
  }

  const authorityTransition = classifyPostFuelAuthorityTransition({
    observationAuthority,
    candidateAuthority: storedAuthority,
    versionCompatibility: 'SAME_VERSION',
  });
  if (authorityTransition !== 'SAME_AUTHORITY') {
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

  if (hasContradictorySettledPostTerminalEvidence(observation, candidate)) {
    return 'DISTINCT_PHYSICAL_RISE';
  }

  return 'SAME_PHYSICAL_RISE';
}
