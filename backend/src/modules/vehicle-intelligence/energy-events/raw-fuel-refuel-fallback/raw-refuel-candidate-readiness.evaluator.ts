import type { RawRefuelCandidate } from '@prisma/client';
import { isRawRefuelCandidateTerminal } from '../raw-refuel-candidate/raw-refuel-candidate-lifecycle';
import type { RawFuelAbsoluteDetectionAdmissibility } from './raw-fuel-refuel-fallback.types';
import type { RawFuelCapability } from './raw-fuel-refuel-fallback.types';
import type {
  RawRefuelCandidateReadinessReasonCode,
  RawRefuelCandidateReadinessResult,
} from './raw-refuel-candidate-readiness.types';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readDetectionAdmissibility(
  candidate: RawRefuelCandidate,
): RawFuelAbsoluteDetectionAdmissibility {
  const qualityMeta = candidate.qualityMeta;
  if (!qualityMeta || typeof qualityMeta !== 'object' || Array.isArray(qualityMeta)) {
    return 'UNKNOWN';
  }
  const value = (qualityMeta as Record<string, unknown>).absoluteDetectionAdmissibility;
  if (value === 'ADMISSIBLE' || value === 'INADMISSIBLE' || value === 'UNKNOWN') {
    return value;
  }
  return 'UNKNOWN';
}

function hasRequiredPhysicalEvidence(candidate: RawRefuelCandidate): boolean {
  if (!candidate.riseOnsetAt || !candidate.riseEndAt) return false;
  if (candidate.signalChannel === 'ABSOLUTE_LITERS') {
    return (
      isFiniteNumber(candidate.preFuelAbsoluteLiters) &&
      isFiniteNumber(candidate.postFuelAbsoluteLiters) &&
      isFiniteNumber(candidate.deltaAbsoluteLiters)
    );
  }
  return (
    isFiniteNumber(candidate.preFuelRelativePercent) &&
    isFiniteNumber(candidate.postFuelRelativePercent) &&
    isFiniteNumber(candidate.deltaRelativePercent)
  );
}

function buildResult(
  candidate: RawRefuelCandidate,
  ready: boolean,
  reasonCode: RawRefuelCandidateReadinessReasonCode,
  detail: string,
): RawRefuelCandidateReadinessResult {
  return {
    ready,
    reasonCode,
    lifecycleState: candidate.lifecycleState,
    detail,
  };
}

export interface RawRefuelCandidateReadinessContext {
  capability?: RawFuelCapability;
  absoluteDetectionAdmissibility?: RawFuelAbsoluteDetectionAdmissibility;
}

/**
 * F4 runtime READY evaluator — uses persisted F2 candidate as authority.
 * Does not trust raw F3 observation lifecycle without re-evaluation.
 */
export function evaluateRawRefuelCandidateReadiness(
  candidate: RawRefuelCandidate,
  context: RawRefuelCandidateReadinessContext = {},
): RawRefuelCandidateReadinessResult {
  const lifecycle = candidate.lifecycleState;

  if (lifecycle === 'REJECTED') {
    return buildResult(candidate, false, 'TERMINAL_REJECTED', 'candidate_lifecycle_rejected');
  }
  if (lifecycle === 'PROMOTED') {
    return buildResult(candidate, false, 'TERMINAL_PROMOTED', 'candidate_lifecycle_promoted');
  }

  if (context.capability === 'NON_FUEL_CAPABLE') {
    return buildResult(candidate, false, 'CAPABILITY_NOT_SUPPORTED', 'capability_non_fuel');
  }
  if (context.capability === 'UNKNOWN') {
    return buildResult(candidate, false, 'CAPABILITY_UNKNOWN', 'capability_unknown');
  }

  const admissibility =
    context.absoluteDetectionAdmissibility ?? readDetectionAdmissibility(candidate);
  if (admissibility === 'INADMISSIBLE') {
    return buildResult(candidate, false, 'DETECTION_NOT_ADMISSIBLE', 'detection_inadmissible');
  }

  if (!candidate.candidateIdentityKey) {
    return buildResult(candidate, false, 'MISSING_IDENTITY_KEY', 'missing_candidate_identity_key');
  }

  if (!hasRequiredPhysicalEvidence(candidate)) {
    return buildResult(candidate, false, 'INSUFFICIENT_EVIDENCE', 'missing_physical_evidence');
  }

  if (lifecycle === 'INSUFFICIENT') {
    return buildResult(candidate, false, 'INSUFFICIENT_EVIDENCE', 'lifecycle_insufficient');
  }
  if (lifecycle === 'OBSERVED') {
    return buildResult(candidate, false, 'CANDIDATE_OBSERVED', 'lifecycle_observed');
  }
  if (lifecycle === 'SETTLING') {
    return buildResult(
      candidate,
      false,
      candidate.rejectionReason === 'INSUFFICIENT_POST_PLATEAU' ||
        candidate.rejectionReason === 'EVIDENCE_STILL_SETTLING'
        ? 'POST_PLATEAU_NOT_FINAL'
        : 'CANDIDATE_SETTLING',
      'lifecycle_settling',
    );
  }

  if (lifecycle !== 'READY_FOR_PERSIST') {
    return buildResult(candidate, false, 'INVALID_EVIDENCE', `unexpected_lifecycle_${lifecycle}`);
  }

  if (isRawRefuelCandidateTerminal(lifecycle)) {
    return buildResult(candidate, false, 'INVALID_EVIDENCE', 'terminal_lifecycle_unexpected');
  }

  const minPostSamples = candidate.postPlateauSampleCount ?? 0;
  const minPreSamples = candidate.prePlateauSampleCount ?? 0;
  if (minPostSamples < 3 || minPreSamples < 3) {
    return buildResult(candidate, false, 'POST_PLATEAU_NOT_FINAL', 'plateau_sample_counts_below_f3_minimum');
  }

  return buildResult(candidate, true, 'READY', 'candidate_ready_for_f4_pre_promotion');
}
