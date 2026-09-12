import type { RawRefuelCandidate } from '@prisma/client';
import {
  RAW_REFUEL_CANDIDATE_POST_PLATEAU_TOLERANCE_LITERS,
  RAW_REFUEL_CANDIDATE_PRE_PLATEAU_TOLERANCE_LITERS,
  RAW_REFUEL_CANDIDATE_PRE_PLATEAU_TOLERANCE_PERCENT,
  RAW_REFUEL_CANDIDATE_RISE_NEIGHBORHOOD_MS,
} from './raw-refuel-candidate.constants';
import type {
  RawRefuelCandidateEvidenceSlice,
  RawRefuelCandidateOverlapClassification,
} from './raw-refuel-candidate.types';

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

function hasCompatiblePostPlateau(
  left: RawRefuelCandidateEvidenceSlice,
  right: RawRefuelCandidateEvidenceSlice,
): boolean | null {
  if (left.signalChannel === 'ABSOLUTE_LITERS') {
    if (left.postFuelAbsoluteLiters == null || right.postFuelAbsoluteLiters == null) {
      return null;
    }
    return withinTolerance(
      left.postFuelAbsoluteLiters,
      right.postFuelAbsoluteLiters,
      RAW_REFUEL_CANDIDATE_POST_PLATEAU_TOLERANCE_LITERS,
    );
  }
  if (left.postFuelRelativePercent == null || right.postFuelRelativePercent == null) {
    return null;
  }
  return withinTolerance(
    left.postFuelRelativePercent,
    right.postFuelRelativePercent,
    RAW_REFUEL_CANDIDATE_PRE_PLATEAU_TOLERANCE_PERCENT,
  );
}

function candidateToEvidenceSlice(row: RawRefuelCandidate): RawRefuelCandidateEvidenceSlice {
  return {
    organizationId: row.organizationId,
    vehicleId: row.vehicleId,
    detectionVersion: row.detectionVersion,
    signalChannel: row.signalChannel,
    physicalEvidenceStart: row.physicalEvidenceStart,
    physicalEvidenceEnd: row.physicalEvidenceEnd,
    riseOnsetAt: row.riseOnsetAt,
    riseEndAt: row.riseEndAt,
    preFuelAbsoluteLiters: row.preFuelAbsoluteLiters,
    postFuelAbsoluteLiters: row.postFuelAbsoluteLiters,
    deltaAbsoluteLiters: row.deltaAbsoluteLiters,
    preFuelRelativePercent: row.preFuelRelativePercent,
    postFuelRelativePercent: row.postFuelRelativePercent,
    deltaRelativePercent: row.deltaRelativePercent,
    prePlateauSampleCount: row.prePlateauSampleCount,
    postPlateauSampleCount: row.postPlateauSampleCount,
    totalSampleCount: row.totalSampleCount,
    maxSampleGapSeconds: row.maxSampleGapSeconds,
    absoluteSignalTrust: row.absoluteSignalTrust,
    relativeSignalAvailable: row.relativeSignalAvailable,
    routeEvidenceAvailable: row.routeEvidenceAvailable,
    stationaryEvidenceAvailable: row.stationaryEvidenceAvailable,
    scanWindowStart: row.scanWindowStart,
    scanWindowEnd: row.scanWindowEnd,
    signalProvider: row.signalProvider,
    evidenceMeta: (row.evidenceMeta as Record<string, unknown> | null) ?? null,
    qualityMeta: (row.qualityMeta as Record<string, unknown> | null) ?? null,
  };
}

/**
 * Semantic overlap matcher — tri-state, fail-closed.
 * Does NOT compare candidateIdentityKey or 5-minute buckets alone.
 */
export function classifyRawRefuelCandidateOverlap(
  observation: RawRefuelCandidateEvidenceSlice,
  existing: RawRefuelCandidate | RawRefuelCandidateEvidenceSlice,
): RawRefuelCandidateOverlapClassification {
  const candidate =
    'signalChannel' in existing && 'organizationId' in existing && !('candidateIdentityKey' in existing)
      ? existing
      : candidateToEvidenceSlice(existing as RawRefuelCandidate);

  if (observation.vehicleId !== candidate.vehicleId) {
    return 'DISTINCT_PHYSICAL_RISE';
  }
  if (observation.organizationId !== candidate.organizationId) {
    return 'DISTINCT_PHYSICAL_RISE';
  }
  if (observation.signalChannel !== candidate.signalChannel) {
    return 'DISTINCT_PHYSICAL_RISE';
  }
  if (observation.detectionVersion !== candidate.detectionVersion) {
    return 'DISTINCT_PHYSICAL_RISE';
  }

  const obsRise = observation.riseOnsetAt;
  const candRise = candidate.riseOnsetAt;
  if (obsRise && candRise) {
    const riseDistance = msBetween(obsRise, candRise);
    if (riseDistance > RAW_REFUEL_CANDIDATE_RISE_NEIGHBORHOOD_MS) {
      const preCompatible = hasCompatiblePrePlateau(observation, candidate);
      const postCompatible = hasCompatiblePostPlateau(observation, candidate);
      if (preCompatible === false || postCompatible === false) {
        return 'DISTINCT_PHYSICAL_RISE';
      }
      if (preCompatible == null && postCompatible == null) {
        return 'INSUFFICIENT_EVIDENCE';
      }
    }
  }

  const preCompatible = hasCompatiblePrePlateau(observation, candidate);
  if (preCompatible === false) {
    return 'DISTINCT_PHYSICAL_RISE';
  }

  const temporalOverlap =
    windowsOverlap(
      observation.physicalEvidenceStart,
      observation.physicalEvidenceEnd,
      candidate.physicalEvidenceStart,
      candidate.physicalEvidenceEnd,
    ) ||
    (obsRise &&
      candRise &&
      msBetween(obsRise, candRise) <= RAW_REFUEL_CANDIDATE_RISE_NEIGHBORHOOD_MS);

  if (!temporalOverlap) {
    if (preCompatible === true) {
      return 'INSUFFICIENT_EVIDENCE';
    }
    return 'DISTINCT_PHYSICAL_RISE';
  }

  const postCompatible = hasCompatiblePostPlateau(observation, candidate);
  if (postCompatible === false) {
    const obsPost = observation.postFuelAbsoluteLiters ?? observation.postFuelRelativePercent;
    const candPost = candidate.postFuelAbsoluteLiters ?? candidate.postFuelRelativePercent;
    const obsPre = observation.preFuelAbsoluteLiters ?? observation.preFuelRelativePercent;
    const candPre = candidate.preFuelAbsoluteLiters ?? candidate.preFuelRelativePercent;
    if (
      obsPost != null &&
      candPost != null &&
      obsPre != null &&
      candPre != null &&
      obsPost > obsPre &&
      candPost > candPre
    ) {
      return 'DISTINCT_PHYSICAL_RISE';
    }
    return 'INSUFFICIENT_EVIDENCE';
  }

  if (preCompatible == null && postCompatible == null && !obsRise && !candRise) {
    return 'INSUFFICIENT_EVIDENCE';
  }

  return 'SAME_PHYSICAL_RISE';
}

export { candidateToEvidenceSlice };
