import type { TripDetectionState } from '@prisma/client';

export type ShadowPauseOutcome =
  | 'SAME_TRIP_RESUME'
  | 'RESUME_DURING_POSSIBLE_END'
  | 'NEW_TRIP_AFTER_COMPLETION'
  | 'NEW_TRIP_AFTER_RESTING'
  | 'NO_RESUME_OBSERVED'
  | 'AMBIGUOUS'
  | 'INVALIDATED_BY_MOVEMENT'
  | 'CROSS_TRIP_INCONSISTENCY';

/** Reporting buckets only — not FSM thresholds. */
export type ShadowPauseDurationBucket =
  | '<2min'
  | '2-5min'
  | '5-10min'
  | '10-15min'
  | '15-30min'
  | '30-60min'
  | '>=60min';

export type ShadowProviderSilenceEvaluation = {
  evaluated: true;
  eligible: boolean;
  wouldAdmitAt: string | null;
  candidateAt: string | null;
  candidateSource: 'provider_silence_candidate' | null;
  clockAuthority: 'PROVIDER_EVENT_TIME' | null;
  trust: false | null;
  blockedBy: string | null;
  lastProviderActivityAt: string | null;
  vlsFreshnessClass: string;
  postCandidateMovementObserved: boolean;
  realWinningEndPath: string | null;
  observedAt: string;
};

export type ShadowPauseEpisode = {
  pauseEpisodeId: string;
  vehicleId: string;
  tripId: string | null;
  episodeStartedAt: string;
  episodeStartSource: string;
  bestObservedStopAnchorAt: string | null;
  realFsmStateAtPauseStart: TripDetectionState | string;
  possibleEndAt: string | null;
  completedAt: string | null;
  restingAt: string | null;
  activeTripIdAtPauseStart: string | null;
  resumeAt?: string | null;
  pauseDurationMs?: number | null;
  pauseDurationBucket?: ShadowPauseDurationBucket | null;
  movementEvidenceSource?: string | null;
  fsmStateAtResume?: TripDetectionState | string | null;
  activeTripIdAtResume?: string | null;
  tripIdAtResume?: string | null;
  sameTripContinued?: boolean | null;
  newTripCreated?: boolean | null;
  previousTripAlreadyCompleted?: boolean | null;
  previousTripAlreadyResting?: boolean | null;
  shadowPauseOutcome?: ShadowPauseOutcome | null;
  realEndCandidateAt?: string | null;
  realPossibleEndAt?: string | null;
  realEndValidationAt?: string | null;
  realCompletedAt?: string | null;
  realRestingAt?: string | null;
  shadowTripWouldStillBeOpenAtResume?: boolean | 'UNKNOWN' | null;
  shadowTripWasTerminalBeforeResume?: boolean | 'UNKNOWN' | null;
};

export type ShadowObservabilityState = {
  providerSilence: {
    everEvaluated: boolean;
    everEligible: boolean;
    firstEligibleAt: string | null;
    candidateAt: string | null;
    candidateSource: string | null;
    trust: false | null;
    clockAuthority: string | null;
    realWinningEndPath: string | null;
    invalidatedByMovement: boolean;
    blockedReasons: string[];
    lastEvaluation: ShadowProviderSilenceEvaluation | null;
    evaluationCount: number;
  };
  pause: {
    activeEpisodeId: string | null;
    episodeCount: number;
    resumedEpisodeCount: number;
    longestPauseMs: number;
    sameTripResumeCount: number;
    newTripAfterTerminalCount: number;
    ambiguousCount: number;
    episodes: ShadowPauseEpisode[];
  };
};

export type ShadowTerminalSummary = {
  providerSilence: ShadowObservabilityState['providerSilence'];
  pauses: {
    episodeCount: number;
    resumedEpisodeCount: number;
    longestPauseMs: number;
    outcomes: ShadowPauseOutcome[];
    sameTripResumeCount: number;
    newTripAfterTerminalCount: number;
    ambiguousCount: number;
  };
};

export const SHADOW_OBSERVABILITY_NAMESPACE = 'shadowObservability';
