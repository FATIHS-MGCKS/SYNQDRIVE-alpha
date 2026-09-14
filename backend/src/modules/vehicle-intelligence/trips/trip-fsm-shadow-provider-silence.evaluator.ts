import {
  assessProviderSilenceEmptyCoreAdmission,
  classifyEmptyCoreVlsInactivity,
  type EmptyCoreForensics,
  type EmptyCoreVlsTelemetry,
} from './trip-empty-core-end-gate';
import type { StopBoundaryProvenance } from './trip-fsm-clock-contract';
import type { ShadowProviderSilenceEvaluation } from './trip-fsm-shadow-observability.types';

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
  /** Authoritative empty-core forensics from the same tick — observation only. */
  emptyCoreForensics?: EmptyCoreForensics | null;
  /** When real FSM already chose a stronger end path this tick. */
  realWinningEndPath?: string | null;
  /** Trip/end-cycle isolation — shadow must not reuse stale candidates. */
  activeTripId: string | null;
  observedTripId: string | null;
  endCycleGeneration?: string | null;
  observedEndCycleGeneration?: string | null;
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

/**
 * Counterfactual #1635 provider-silence observation.
 * Reuses the authoritative admission contract — never mutates inputs or FSM state.
 */
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
    params.endCycleGeneration &&
    params.observedEndCycleGeneration &&
    params.endCycleGeneration !== params.observedEndCycleGeneration
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

  return {
    evaluated: true,
    eligible: blockedBy ? false : admission.eligible,
    wouldAdmitAt:
      !blockedBy && admission.eligible && candidate
        ? candidate.anchorAt.toISOString()
        : null,
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
  };
}
