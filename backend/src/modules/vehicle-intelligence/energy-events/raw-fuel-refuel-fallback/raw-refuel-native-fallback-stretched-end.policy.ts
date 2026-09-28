import type { RawRefuelCandidate } from '@prisma/client';
import {
  chooseCanonicalRefuel,
  classifyPhysicalRefuelSibling,
  DEFAULT_PHYSICAL_REFUEL_MATCHER_TOLERANCES,
  type PhysicalRefuelIdentityResult,
  type PhysicalRefuelMatcherTolerances,
  type RefuelRowForMatcher,
} from '../physical-refuel-identity.matcher';
import { rawRefuelCandidateToRefuelRowForMatcher } from './raw-refuel-native-overlap.advisory';

/** Bounded fallback↔native convergence when canonical matcher fails only on end time. */
export const DEFAULT_STRETCHED_END_FALLBACK_CONVERGENCE_LIMITS = {
  /** Minimum intra-candidate sample gap (seconds) evidencing telemetry stretch. */
  minSampleGapSeconds: 120,
  /** physicalEvidenceEnd must extend at least this many seconds beyond riseEndAt. */
  minPhysicalEvidenceBeyondRiseSec: 60,
  /** Native end may trail riseEndAt by at most this (delayed native segment end). */
  maxNativeEndAfterRiseEndSec: 2 * 60 * 60,
  /** Rise onset may precede native start by at most this. */
  maxRiseOnsetBeforeNativeStartSec: 15 * 60,
  /** Rise onset may follow native end by at most this when gap evidence exists. */
  maxRiseOnsetAfterNativeEndSec: 5 * 60,
} as const;

export type StretchedEndFallbackConvergenceLimits =
  typeof DEFAULT_STRETCHED_END_FALLBACK_CONVERGENCE_LIMITS;

export function buildRiseBoundedFallbackMatcherRow(
  candidate: RawRefuelCandidate,
): RefuelRowForMatcher | null {
  if (!candidate.riseOnsetAt || !candidate.riseEndAt) {
    return null;
  }
  const base = rawRefuelCandidateToRefuelRowForMatcher(candidate);
  return {
    ...base,
    startTime: candidate.riseOnsetAt.toISOString(),
    endTime: candidate.riseEndAt.toISOString(),
  };
}

export function hasFallbackTelemetryStretchEvidence(
  candidate: RawRefuelCandidate,
  limits: StretchedEndFallbackConvergenceLimits = DEFAULT_STRETCHED_END_FALLBACK_CONVERGENCE_LIMITS,
): boolean {
  const gapSeconds = candidate.maxSampleGapSeconds ?? 0;
  if (gapSeconds >= limits.minSampleGapSeconds) {
    return true;
  }
  if (
    candidate.riseEndAt &&
    candidate.physicalEvidenceEnd &&
    candidate.physicalEvidenceEnd.getTime() - candidate.riseEndAt.getTime() >=
      limits.minPhysicalEvidenceBeyondRiseSec * 1000
  ) {
    return true;
  }
  return false;
}

function terminalFuelCompatible(
  candidateRow: RefuelRowForMatcher,
  nativeRow: RefuelRowForMatcher,
  tol: PhysicalRefuelMatcherTolerances,
): boolean {
  const fuelEndA = candidateRow.fuelEndLiters;
  const fuelEndB = nativeRow.fuelEndLiters;
  if (fuelEndA != null && fuelEndB != null && Math.abs(fuelEndA - fuelEndB) > tol.fuelLiters) {
    return false;
  }
  if (
    candidateRow.fuelEndPercent != null &&
    nativeRow.fuelEndPercent != null &&
    Math.abs(candidateRow.fuelEndPercent - nativeRow.fuelEndPercent) > tol.fuelPercent
  ) {
    return false;
  }
  return fuelEndA != null && fuelEndB != null;
}

function transitionMagnitudeCompatible(
  candidateRow: RefuelRowForMatcher,
  nativeRow: RefuelRowForMatcher,
  tol: PhysicalRefuelMatcherTolerances,
): boolean {
  const cStart = candidateRow.fuelStartLiters;
  const cEnd = candidateRow.fuelEndLiters;
  const nStart = nativeRow.fuelStartLiters;
  const nEnd = nativeRow.fuelEndLiters;
  if (cStart == null || cEnd == null || nStart == null || nEnd == null) {
    return false;
  }
  if (cEnd <= cStart + tol.fuelLiters * 0.01 || nEnd <= nStart + tol.fuelLiters * 0.01) {
    return false;
  }
  if (Math.abs(cStart - nStart) > tol.fuelLiters) {
    return false;
  }
  const cDelta = cEnd - cStart;
  const nDelta = nEnd - nStart;
  const maxDelta = Math.max(cDelta, nDelta, tol.fuelLiters);
  if (Math.abs(cDelta - nDelta) > Math.max(tol.fuelLiters, maxDelta * 0.35)) {
    return false;
  }
  if (cStart < nStart - tol.fuelLiters || cEnd > nEnd + tol.fuelLiters) {
    return false;
  }
  return true;
}

function riseOnsetTemporallyCompatibleWithNative(
  candidate: RawRefuelCandidate,
  nativeRow: RefuelRowForMatcher,
  limits: StretchedEndFallbackConvergenceLimits,
): boolean {
  if (!candidate.riseOnsetAt) {
    return false;
  }
  const riseMs = candidate.riseOnsetAt.getTime();
  const nativeStartMs = new Date(nativeRow.startTime).getTime();
  const nativeEndMs = new Date(nativeRow.endTime).getTime();
  if (riseMs < nativeStartMs - limits.maxRiseOnsetBeforeNativeStartSec * 1000) {
    return false;
  }
  if (riseMs > nativeEndMs + limits.maxRiseOnsetAfterNativeEndSec * 1000) {
    return false;
  }
  if (!candidate.riseEndAt) {
    return false;
  }
  const riseEndMs = candidate.riseEndAt.getTime();
  const nativeEndAfterRiseSec = (nativeEndMs - riseEndMs) / 1000;
  if (nativeEndAfterRiseSec > limits.maxNativeEndAfterRiseEndSec) {
    return false;
  }
  return true;
}

function detectHardDistinctReason(
  candidateRow: RefuelRowForMatcher,
  nativeRow: RefuelRowForMatcher,
  tol: PhysicalRefuelMatcherTolerances,
): string | null {
  if (candidateRow.vehicleId !== nativeRow.vehicleId) {
    return 'different_vehicle';
  }
  const fuelEndA = candidateRow.fuelEndLiters;
  const fuelEndB = nativeRow.fuelEndLiters;
  if (fuelEndA != null && fuelEndB != null && Math.abs(fuelEndA - fuelEndB) > tol.fuelLiters) {
    return 'terminal_fuel_liters_mismatch';
  }
  if (
    candidateRow.fuelEndPercent != null &&
    nativeRow.fuelEndPercent != null &&
    Math.abs(candidateRow.fuelEndPercent - nativeRow.fuelEndPercent) > tol.fuelPercent
  ) {
    return 'terminal_fuel_percent_mismatch';
  }
  const odoA = candidateRow.odometerEndKm;
  const odoB = nativeRow.odometerEndKm;
  if (odoA != null && odoB != null && Math.abs(odoA - odoB) > tol.odometerKm) {
    return 'odometer_mismatch';
  }
  const cStart = candidateRow.fuelStartLiters;
  const nStart = nativeRow.fuelStartLiters;
  if (cStart != null && nStart != null && Math.abs(cStart - nStart) > tol.fuelLiters) {
    return 'transition_incompatible';
  }
  return null;
}

function evaluateStretchedEndSamePhysicalRefuel(
  candidate: RawRefuelCandidate,
  candidateRow: RefuelRowForMatcher,
  nativeRow: RefuelRowForMatcher,
  tol: PhysicalRefuelMatcherTolerances = DEFAULT_PHYSICAL_REFUEL_MATCHER_TOLERANCES,
  limits: StretchedEndFallbackConvergenceLimits = DEFAULT_STRETCHED_END_FALLBACK_CONVERGENCE_LIMITS,
): PhysicalRefuelIdentityResult | null {
  if (candidateRow.vehicleId !== nativeRow.vehicleId) {
    return null;
  }
  if (!hasFallbackTelemetryStretchEvidence(candidate, limits)) {
    return null;
  }
  if (!riseOnsetTemporallyCompatibleWithNative(candidate, nativeRow, limits)) {
    return null;
  }
  if (!terminalFuelCompatible(candidateRow, nativeRow, tol)) {
    return null;
  }
  if (!transitionMagnitudeCompatible(candidateRow, nativeRow, tol)) {
    return null;
  }
  const odoA = candidateRow.odometerEndKm;
  const odoB = nativeRow.odometerEndKm;
  if (odoA != null && odoB != null && Math.abs(odoA - odoB) > tol.odometerKm) {
    return null;
  }
  return {
    classification: 'SAME_PHYSICAL_REFUEL',
    reason: 'stretched_end_telemetry_gap_same',
    canonicalId: chooseCanonicalRefuel(candidateRow, nativeRow, tol),
  };
}

/**
 * F5 fallback↔authoritative-native assessment. Canonical G2 matcher stays strict;
 * only end_time_mismatch may be overridden with bounded telemetry-gap evidence.
 */
export function classifyFallbackAgainstAuthoritativeNativeRefuel(
  candidate: RawRefuelCandidate,
  nativeRow: RefuelRowForMatcher,
  tol: PhysicalRefuelMatcherTolerances = DEFAULT_PHYSICAL_REFUEL_MATCHER_TOLERANCES,
  limits: StretchedEndFallbackConvergenceLimits = DEFAULT_STRETCHED_END_FALLBACK_CONVERGENCE_LIMITS,
): PhysicalRefuelIdentityResult {
  const candidateRow = rawRefuelCandidateToRefuelRowForMatcher(candidate);
  const canonical = classifyPhysicalRefuelSibling(candidateRow, nativeRow, tol);
  if (canonical.classification === 'SAME_PHYSICAL_REFUEL') {
    return canonical;
  }
  if (canonical.classification === 'INSUFFICIENT_EVIDENCE') {
    return canonical;
  }
  if (canonical.reason !== 'end_time_mismatch') {
    return canonical;
  }

  const hardReason = detectHardDistinctReason(candidateRow, nativeRow, tol);
  if (hardReason) {
    return { classification: 'DISTINCT_PHYSICAL_REFUEL', reason: hardReason };
  }

  const riseBounded = buildRiseBoundedFallbackMatcherRow(candidate);
  if (riseBounded) {
    const riseMatch = classifyPhysicalRefuelSibling(riseBounded, nativeRow, tol);
    if (riseMatch.classification === 'SAME_PHYSICAL_REFUEL') {
      return {
        ...riseMatch,
        reason: 'stretched_end_rise_bounded_same',
      };
    }
    if (riseMatch.classification === 'INSUFFICIENT_EVIDENCE') {
      return riseMatch;
    }
    if (riseMatch.reason !== 'end_time_mismatch') {
      return riseMatch;
    }
  }

  const stretched = evaluateStretchedEndSamePhysicalRefuel(
    candidate,
    candidateRow,
    nativeRow,
    tol,
    limits,
  );
  if (stretched) {
    return stretched;
  }
  return canonical;
}
