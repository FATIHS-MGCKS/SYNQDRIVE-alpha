import { randomUUID } from 'crypto';
import type { TripDetectionState } from '@prisma/client';
import type {
  ShadowObservabilityState,
  ShadowPauseDurationBucket,
  ShadowPauseEpisode,
  ShadowPauseOutcome,
} from './trip-fsm-shadow-observability.types';

export function createEmptyShadowObservabilityState(): ShadowObservabilityState {
  return {
    providerSilence: {
      everEvaluated: false,
      everEligible: false,
      firstEligibleAt: null,
      candidateAt: null,
      candidateSource: null,
      trust: null,
      clockAuthority: null,
      realWinningEndPath: null,
      invalidatedByMovement: false,
      blockedReasons: [],
      lastEvaluation: null,
      evaluationCount: 0,
    },
    pause: {
      activeEpisodeId: null,
      episodeCount: 0,
      resumedEpisodeCount: 0,
      longestPauseMs: 0,
      sameTripResumeCount: 0,
      newTripAfterTerminalCount: 0,
      ambiguousCount: 0,
      episodes: [],
    },
  };
}

export function readShadowObservabilityState(
  summary: Record<string, unknown> | null | undefined,
): ShadowObservabilityState {
  const raw = summary?.shadowObservability;
  if (!raw || typeof raw !== 'object') {
    return createEmptyShadowObservabilityState();
  }
  const parsed = raw as Partial<ShadowObservabilityState>;
  return {
    providerSilence: {
      ...createEmptyShadowObservabilityState().providerSilence,
      ...(parsed.providerSilence ?? {}),
      blockedReasons: Array.isArray(parsed.providerSilence?.blockedReasons)
        ? parsed.providerSilence!.blockedReasons.filter(
            (r): r is string => typeof r === 'string',
          )
        : [],
    },
    pause: {
      ...createEmptyShadowObservabilityState().pause,
      ...(parsed.pause ?? {}),
      episodes: Array.isArray(parsed.pause?.episodes)
        ? (parsed.pause!.episodes as ShadowPauseEpisode[])
        : [],
    },
  };
}

export function mergeShadowObservabilityIntoSummary(
  priorSummary: Record<string, unknown> | null | undefined,
  shadowState: ShadowObservabilityState,
): Record<string, unknown> {
  return {
    ...(priorSummary ?? {}),
    shadowObservability: shadowState,
  };
}

const MAX_PAUSE_EPISODES = 32;

export function classifyPauseDurationBucket(
  pauseDurationMs: number,
): ShadowPauseDurationBucket {
  if (pauseDurationMs < 2 * 60_000) return '<2min';
  if (pauseDurationMs < 5 * 60_000) return '2-5min';
  if (pauseDurationMs < 10 * 60_000) return '5-10min';
  if (pauseDurationMs < 15 * 60_000) return '10-15min';
  if (pauseDurationMs < 30 * 60_000) return '15-30min';
  if (pauseDurationMs < 60 * 60_000) return '30-60min';
  return '>=60min';
}

export function classifyShadowPauseOutcome(input: {
  sameTripContinued: boolean;
  newTripCreated: boolean;
  previousTripAlreadyCompleted: boolean;
  previousTripAlreadyResting: boolean;
  fsmStateAtResume: TripDetectionState | string;
  realFsmStateAtPauseStart: TripDetectionState | string;
  invalidatedByMovement?: boolean;
  crossTripInconsistency?: boolean;
}): ShadowPauseOutcome {
  if (input.crossTripInconsistency) return 'CROSS_TRIP_INCONSISTENCY';
  if (input.invalidatedByMovement) return 'INVALIDATED_BY_MOVEMENT';
  if (input.previousTripAlreadyResting && input.newTripCreated) {
    return 'NEW_TRIP_AFTER_RESTING';
  }
  if (input.previousTripAlreadyCompleted && input.newTripCreated) {
    return 'NEW_TRIP_AFTER_COMPLETION';
  }
  if (
    input.sameTripContinued &&
    (input.fsmStateAtResume === 'POSSIBLE_END' ||
      input.realFsmStateAtPauseStart === 'POSSIBLE_END')
  ) {
    return 'RESUME_DURING_POSSIBLE_END';
  }
  if (input.sameTripContinued) return 'SAME_TRIP_RESUME';
  if (input.newTripCreated) return 'NEW_TRIP_AFTER_COMPLETION';
  return 'AMBIGUOUS';
}

export function startShadowPauseEpisode(
  state: ShadowObservabilityState,
  input: {
    vehicleId: string;
    tripId: string | null;
    episodeStartedAt: Date;
    episodeStartSource: string;
    bestObservedStopAnchorAt: Date | null;
    realFsmStateAtPauseStart: TripDetectionState | string;
    possibleEndAt: Date | null;
    completedAt: Date | null;
    restingAt: Date | null;
    activeTripIdAtPauseStart: string | null;
    realEndCandidateAt?: Date | null;
    realPossibleEndAt?: Date | null;
  },
): ShadowObservabilityState {
  if (state.pause.activeEpisodeId) {
    return state;
  }
  const episode: ShadowPauseEpisode = {
    pauseEpisodeId: randomUUID(),
    vehicleId: input.vehicleId,
    tripId: input.tripId,
    episodeStartedAt: input.episodeStartedAt.toISOString(),
    episodeStartSource: input.episodeStartSource,
    bestObservedStopAnchorAt: input.bestObservedStopAnchorAt?.toISOString() ?? null,
    realFsmStateAtPauseStart: input.realFsmStateAtPauseStart,
    possibleEndAt: input.possibleEndAt?.toISOString() ?? null,
    completedAt: input.completedAt?.toISOString() ?? null,
    restingAt: input.restingAt?.toISOString() ?? null,
    activeTripIdAtPauseStart: input.activeTripIdAtPauseStart,
    realEndCandidateAt: input.realEndCandidateAt?.toISOString() ?? null,
    realPossibleEndAt: input.realPossibleEndAt?.toISOString() ?? null,
    shadowPauseOutcome: 'NO_RESUME_OBSERVED',
  };
  const episodes = [...state.pause.episodes, episode].slice(-MAX_PAUSE_EPISODES);
  return {
    ...state,
    pause: {
      ...state.pause,
      activeEpisodeId: episode.pauseEpisodeId,
      episodeCount: state.pause.episodeCount + 1,
      episodes,
    },
  };
}

export function recordShadowPauseResume(
  state: ShadowObservabilityState,
  input: {
    resumeAt: Date;
    movementEvidenceSource: string;
    fsmStateAtResume: TripDetectionState | string;
    activeTripIdAtResume: string | null;
    tripIdAtResume: string | null;
    completedAt?: Date | null;
    restingAt?: Date | null;
    realEndValidationAt?: Date | null;
    realCompletedAt?: Date | null;
    realRestingAt?: Date | null;
    invalidatedByMovement?: boolean;
  },
): ShadowObservabilityState {
  const activeId = state.pause.activeEpisodeId;
  if (!activeId) return state;

  const episodes = state.pause.episodes.map((ep) => {
    if (ep.pauseEpisodeId !== activeId || ep.resumeAt) return ep;

    const pauseDurationMs =
      input.resumeAt.getTime() - new Date(ep.episodeStartedAt).getTime();
    const sameTripContinued =
      !!ep.activeTripIdAtPauseStart &&
      ep.activeTripIdAtPauseStart === input.activeTripIdAtResume;
    const newTripCreated =
      !!input.activeTripIdAtResume &&
      ep.activeTripIdAtPauseStart !== input.activeTripIdAtResume;
    const previousTripAlreadyCompleted = !!ep.completedAt;
    const previousTripAlreadyResting = !!ep.restingAt;

    const shadowPauseOutcome = classifyShadowPauseOutcome({
      sameTripContinued,
      newTripCreated,
      previousTripAlreadyCompleted,
      previousTripAlreadyResting,
      fsmStateAtResume: input.fsmStateAtResume,
      realFsmStateAtPauseStart: ep.realFsmStateAtPauseStart,
      invalidatedByMovement: input.invalidatedByMovement,
      crossTripInconsistency:
        !!input.tripIdAtResume &&
        !!ep.tripId &&
        input.tripIdAtResume !== ep.tripId &&
        sameTripContinued,
    });

    const terminalBeforeResume =
      previousTripAlreadyCompleted || previousTripAlreadyResting;

    const shadowTripWouldStillBeOpenAtResume: boolean | 'UNKNOWN' =
      terminalBeforeResume ? false : sameTripContinued ? true : 'UNKNOWN';

    return {
      ...ep,
      resumeAt: input.resumeAt.toISOString(),
      pauseDurationMs,
      pauseDurationBucket: classifyPauseDurationBucket(pauseDurationMs),
      movementEvidenceSource: input.movementEvidenceSource,
      fsmStateAtResume: input.fsmStateAtResume,
      activeTripIdAtResume: input.activeTripIdAtResume,
      tripIdAtResume: input.tripIdAtResume,
      sameTripContinued,
      newTripCreated,
      previousTripAlreadyCompleted,
      previousTripAlreadyResting,
      realEndValidationAt: input.realEndValidationAt?.toISOString() ?? null,
      realCompletedAt: input.realCompletedAt?.toISOString() ?? null,
      realRestingAt: input.realRestingAt?.toISOString() ?? null,
      shadowTripWouldStillBeOpenAtResume,
      shadowTripWasTerminalBeforeResume: terminalBeforeResume,
      shadowPauseOutcome,
    } satisfies ShadowPauseEpisode;
  });

  const resumed = episodes.find((e) => e.pauseEpisodeId === activeId && e.resumeAt);
  if (!resumed) return state;

  const longestPauseMs = Math.max(
    state.pause.longestPauseMs,
    resumed.pauseDurationMs ?? 0,
  );

  let sameTripResumeCount = state.pause.sameTripResumeCount;
  let newTripAfterTerminalCount = state.pause.newTripAfterTerminalCount;
  let ambiguousCount = state.pause.ambiguousCount;

  switch (resumed.shadowPauseOutcome) {
    case 'SAME_TRIP_RESUME':
    case 'RESUME_DURING_POSSIBLE_END':
      sameTripResumeCount += 1;
      break;
    case 'NEW_TRIP_AFTER_COMPLETION':
    case 'NEW_TRIP_AFTER_RESTING':
      newTripAfterTerminalCount += 1;
      break;
    case 'AMBIGUOUS':
    case 'CROSS_TRIP_INCONSISTENCY':
      ambiguousCount += 1;
      break;
    default:
      break;
  }

  return {
    ...state,
    pause: {
      ...state.pause,
      activeEpisodeId: null,
      episodes,
      resumedEpisodeCount: state.pause.resumedEpisodeCount + 1,
      longestPauseMs,
      sameTripResumeCount,
      newTripAfterTerminalCount,
      ambiguousCount,
    },
  };
}

export function applyProviderSilenceShadowEvaluation(
  state: ShadowObservabilityState,
  evaluation: import('./trip-fsm-shadow-observability.types').ShadowProviderSilenceEvaluation,
): ShadowObservabilityState {
  const blockedReasons = [...state.providerSilence.blockedReasons];
  if (evaluation.blockedBy && !blockedReasons.includes(evaluation.blockedBy)) {
    blockedReasons.push(evaluation.blockedBy);
  }
  if (evaluation.postCandidateMovementObserved) {
    return {
      ...state,
      providerSilence: {
        ...state.providerSilence,
        everEvaluated: true,
        evaluationCount: state.providerSilence.evaluationCount + 1,
        lastEvaluation: evaluation,
        invalidatedByMovement: true,
        blockedReasons,
        realWinningEndPath:
          evaluation.realWinningEndPath ?? state.providerSilence.realWinningEndPath,
      },
    };
  }

  return {
    ...state,
    providerSilence: {
      ...state.providerSilence,
      everEvaluated: true,
      everEligible: state.providerSilence.everEligible || evaluation.eligible,
      firstEligibleAt:
        state.providerSilence.firstEligibleAt ??
        (evaluation.eligible ? evaluation.wouldAdmitAt : null),
      candidateAt: evaluation.candidateAt ?? state.providerSilence.candidateAt,
      candidateSource:
        evaluation.candidateSource ?? state.providerSilence.candidateSource,
      trust: evaluation.trust ?? state.providerSilence.trust,
      clockAuthority:
        evaluation.clockAuthority ?? state.providerSilence.clockAuthority,
      realWinningEndPath:
        evaluation.realWinningEndPath ?? state.providerSilence.realWinningEndPath,
      blockedReasons,
      lastEvaluation: evaluation,
      evaluationCount: state.providerSilence.evaluationCount + 1,
    },
  };
}

export function buildShadowTerminalSummary(
  state: ShadowObservabilityState,
): import('./trip-fsm-shadow-observability.types').ShadowTerminalSummary {
  const outcomes = state.pause.episodes
    .map((e) => e.shadowPauseOutcome)
    .filter((o): o is ShadowPauseOutcome => o != null);

  return {
    providerSilence: { ...state.providerSilence },
    pauses: {
      episodeCount: state.pause.episodeCount,
      resumedEpisodeCount: state.pause.resumedEpisodeCount,
      longestPauseMs: state.pause.longestPauseMs,
      outcomes,
      sameTripResumeCount: state.pause.sameTripResumeCount,
      newTripAfterTerminalCount: state.pause.newTripAfterTerminalCount,
      ambiguousCount: state.pause.ambiguousCount,
    },
  };
}

/** Regression guard — authoritative readers must not consume shadow namespace. */
export function assertShadowNotConsumedByAuthoritativeReaders(
  summary: Record<string, unknown>,
): void {
  const keys = Object.keys(summary);
  for (const key of keys) {
    if (key === 'shadowObservability') {
      throw new Error('Authoritative reader attempted to consume shadowObservability');
    }
  }
}

export { SHADOW_OBSERVABILITY_NAMESPACE } from './trip-fsm-shadow-observability.types';
