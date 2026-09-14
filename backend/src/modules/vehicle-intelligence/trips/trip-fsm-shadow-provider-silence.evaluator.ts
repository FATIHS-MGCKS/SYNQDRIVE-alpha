import {
  assessProviderSilenceEmptyCoreAdmission,
  classifyEmptyCoreVlsInactivity,
  type EmptyCoreForensics,
  type EmptyCoreVlsTelemetry,
} from './trip-empty-core-end-gate';
import type { StopBoundaryProvenance } from './trip-fsm-clock-contract';
import type {
  ProviderSilenceCounterfactualStatus,
  ShadowProviderSilenceEvaluation,
} from './trip-fsm-shadow-observability.types';

export type EvaluateProviderSilenceShadowParams = {
  operationalInactiveMs: number;
  minInactivityBeforeCusumMs: number;
  telemetry: EmptyCoreVlsTelemetry | null;
  profile: string;
  workerNow: Date;
  stopBoundaryProvenance?: StopBoundaryProvenance | null;
  performanceActivity: boolean;
  routeMotion: boolean;
  hasCrediblePostMovement: boolean;
  providerSilenceAnchorAt: Date | null;
  lastMeaningfulMovementAt?: Date | null;
  lastProviderActivityAt?: Date | null;
  emptyCoreForensics?: EmptyCoreForensics | null;
  realWinningEndPath?: string | null;
  currentEndCycleGeneration?: string | null;
  storedCandidateEndCycleGeneration?: string | null;
  storedCandidateTripId?: string | null;
  activeTripId: string | null;
  observedTripId: string | null;
  terminalObservedAt?: Date | null;
};

function resolveRealWinningEndPathFromForensics(
  forensics: EmptyCoreForensics | null | undefined,
): string | null {
  if (!forensics) return null;
  if (forensics.providerSilenceAdmissionEligible) {
    return 'provider_silence_admitted';
  }
  if (forensics.boundaryBackedSilenceEligible) {
    return 'trusted_boundary_backed_silence';
  }
  if (forensics.decision === 'POSSIBLE_END') {
    return forensics.reason ?? 'empty_core_possible_end';
  }
  return null;
}

function isStrongerNonProviderSilencePath(path: string | null | undefined): boolean {
  if (!path) return false;
  return !path.includes('provider_silence');
}

function deriveCounterfactualStatus(input: {
  eligible: boolean;
  blockedBy: string | null;
  realWinningEndPath: string | null;
  providerSilenceAnchorAt: Date | null;
  minInactivityBeforeCusumMs: number;
  observationNow: Date;
  terminalObservedAt?: Date | null;
}): ProviderSilenceCounterfactualStatus {
  const observationInstant = input.terminalObservedAt ?? input.observationNow;
  if (
    input.providerSilenceAnchorAt &&
    isStrongerNonProviderSilencePath(input.realWinningEndPath)
  ) {
    const silenceMs =
      observationInstant.getTime() - input.providerSilenceAnchorAt.getTime();
    if (silenceMs < input.minInactivityBeforeCusumMs) {
      return 'NOT_REACHED_BEFORE_TERMINAL';
    }
  }
  if (input.eligible) return 'OBSERVED_ELIGIBLE';
  if (input.blockedBy) return 'OBSERVED_BLOCKED';
  return 'UNKNOWN';
}

export function evaluateProviderSilenceShadow(
  params: EvaluateProviderSilenceShadowParams,
): ShadowProviderSilenceEvaluation {
  const workerNow = params.workerNow;
  const vlsEvidence = classifyEmptyCoreVlsInactivity({
    telemetry: params.telemetry,
    profile: params.profile,
    workerNow,
    maxObservationAgeMs: params.minInactivityBeforeCusumMs,
    stopBoundaryAt: params.stopBoundaryProvenance?.boundaryAt ?? null,
  });

  const trustedStopBoundaryPresent =
    params.stopBoundaryProvenance?.trust === true;

  let blockedBy: string | null = null;

  if (
    params.activeTripId &&
    params.observedTripId &&
    params.activeTripId !== params.observedTripId
  ) {
    blockedBy = 'old_trip_candidate';
  } else if (
    params.storedCandidateTripId &&
    params.observedTripId &&
    params.storedCandidateTripId !== params.observedTripId
  ) {
    blockedBy = 'old_trip_candidate';
  } else if (
    params.currentEndCycleGeneration &&
    params.storedCandidateEndCycleGeneration &&
    params.currentEndCycleGeneration !== params.storedCandidateEndCycleGeneration
  ) {
    blockedBy = 'old_end_cycle_generation';
  }

  const admission = assessProviderSilenceEmptyCoreAdmission({
    operationalInactiveMs: params.operationalInactiveMs,
    minInactivityBeforeCusumMs: params.minInactivityBeforeCusumMs,
    vlsEvidence,
    performanceActivity: params.performanceActivity,
    routeMotion: params.routeMotion,
    hasCrediblePostMovement: params.hasCrediblePostMovement,
    trustedStopBoundaryPresent,
    providerSilenceAnchorAt: params.providerSilenceAnchorAt,
    lastMeaningfulMovementAt: params.lastMeaningfulMovementAt,
    workerNow,
  });

  if (!blockedBy && !admission.eligible) {
    blockedBy = admission.reason;
  }

  const candidate = admission.silenceCandidate ?? null;
  const realWinningEndPath =
    params.realWinningEndPath ??
    resolveRealWinningEndPathFromForensics(params.emptyCoreForensics);

  const eligible = blockedBy ? false : admission.eligible;
  const counterfactualStatus = deriveCounterfactualStatus({
    eligible,
    blockedBy,
    realWinningEndPath,
    providerSilenceAnchorAt: params.providerSilenceAnchorAt,
    minInactivityBeforeCusumMs: params.minInactivityBeforeCusumMs,
    observationNow: workerNow,
    terminalObservedAt: params.terminalObservedAt,
  });

  const competedWithStrongerPath =
    eligible && isStrongerNonProviderSilencePath(realWinningEndPath);

  const falseEndRiskObserved =
    params.hasCrediblePostMovement ||
    blockedBy === 'post_stop_movement_detected' ||
    blockedBy === 'post_stop_positive_contradiction';

  const generationForCandidate = eligible
    ? params.currentEndCycleGeneration ?? null
    : params.storedCandidateEndCycleGeneration ?? null;

  return {
    evaluated: true,
    eligible,
    wouldAdmitAt:
      eligible && candidate ? candidate.anchorAt.toISOString() : null,
    candidateAt: candidate?.anchorAt.toISOString() ?? null,
    candidateSource: candidate?.source ?? null,
    clockAuthority:
      candidate?.clockAuthority === 'PROVIDER_EVENT_TIME'
        ? 'PROVIDER_EVENT_TIME'
        : null,
    trust: candidate ? false : null,
    blockedBy,
    lastProviderActivityAt: params.lastProviderActivityAt?.toISOString() ?? null,
    vlsFreshnessClass: `${vlsEvidence.state}:${vlsEvidence.reason}`,
    postCandidateMovementObserved: params.hasCrediblePostMovement,
    realWinningEndPath,
    observedAt: workerNow.toISOString(),
    counterfactualStatus,
    candidateEndCycleGeneration: generationForCandidate,
    candidateTripId: eligible
      ? params.observedTripId
      : params.storedCandidateTripId ?? null,
    currentEndCycleGeneration: params.currentEndCycleGeneration ?? null,
    competedWithStrongerPath,
    falseEndRiskObserved,
  };
}
