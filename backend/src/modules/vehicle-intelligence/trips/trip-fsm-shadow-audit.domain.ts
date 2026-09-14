import { TripStatus } from '@prisma/client';
import { readPersistedEndRecognizedAt } from './trip-fsm-forensics.util';
import type {
  ShadowPauseEpisode,
  ShadowPauseOutcome,
  ShadowTerminalSummary,
} from './trip-fsm-shadow-observability.types';

export type ProviderSilenceCounterfactualStatus =
  | 'OBSERVED_ELIGIBLE'
  | 'OBSERVED_BLOCKED'
  | 'NOT_REACHED_BEFORE_TERMINAL'
  | 'UNKNOWN';

export type TripLifecycleAuditTimestamps = {
  realEndAt: string | null;
  realCompletedAt: string | null;
  realRestingAt: string | null;
};

export type ShadowAuditTripInput = {
  vehicleId: string;
  tripId: string;
  startAt: Date;
  endTime: Date | null;
  tripStatus: TripStatus;
  rawDetectionMeta: unknown;
  restingObservedAt: Date | null;
};

export type CrossTripPauseCorrelation = {
  priorTripId: string;
  nextTripId: string;
  vehicleId: string;
  interTripPauseMs: number | null;
  crossTripPauseOutcome: ShadowPauseOutcome | 'AMBIGUOUS';
  priorPauseAnchorAt: string | null;
  priorCompletedAt: string | null;
  priorRestingAt: string | null;
  nextTripStartAt: string;
  correlationConfidence: 'HIGH' | 'AMBIGUOUS';
};

export type ShadowAuditRow = {
  TRIP_ID: string;
  START_AT: string;
  END_AT: string | null;
  REAL_END_PATH: string | null;
  REAL_COMPLETED_AT: string | null;
  REAL_RESTING_AT: string | null;
  SHADOW_PROVIDER_SILENCE_EVALUATED: boolean;
  SHADOW_PROVIDER_SILENCE_ELIGIBLE: boolean;
  SHADOW_PROVIDER_SILENCE_FIRST_ELIGIBLE_AT: string | null;
  SHADOW_PROVIDER_SILENCE_BLOCKED_BY: string | null;
  SHADOW_PROVIDER_SILENCE_TRUST: false | null;
  SHADOW_PROVIDER_SILENCE_CLOCK_AUTHORITY: string | null;
  PROVIDER_SILENCE_COUNTERFACTUAL_STATUS: ProviderSilenceCounterfactualStatus;
  SHADOW_PROVIDER_SILENCE_COMPETED_WITH_STRONGER_PATH: 'YES' | 'NO' | 'UNKNOWN';
  SHADOW_FALSE_END_RISK_OBSERVED: 'YES' | 'NO' | 'UNKNOWN';
  SHADOW_CROSS_TRIP_LEAK_OBSERVED: 'YES' | 'NO' | 'UNKNOWN';
  PAUSE_EPISODE_COUNT: number;
  LONGEST_PAUSE_SECONDS: number;
  RESUME_COUNT: number;
  SAME_TRIP_RESUME_COUNT: number;
  NEW_TRIP_AFTER_TERMINAL_COUNT: number;
  AMBIGUOUS_PAUSE_COUNT: number;
};

function readShadowFromRawMeta(raw: unknown): ShadowTerminalSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const shadow = (raw as Record<string, unknown>).shadowObservability;
  if (!shadow || typeof shadow !== 'object') return null;
  return shadow as ShadowTerminalSummary;
}

function readShadowPauseEpisodes(
  shadow: ShadowTerminalSummary | null | undefined,
): ShadowPauseEpisode[] {
  if (!shadow) return [];
  const fromTerminal = shadow.pauses?.episodes;
  if (Array.isArray(fromTerminal)) {
    return fromTerminal as ShadowPauseEpisode[];
  }
  const rawPause = (shadow as Record<string, unknown>).pause;
  if (rawPause && typeof rawPause === 'object') {
    const episodes = (rawPause as { episodes?: unknown }).episodes;
    if (Array.isArray(episodes)) {
      return episodes as ShadowPauseEpisode[];
    }
  }
  return [];
}

function readEndPath(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = (raw as Record<string, unknown>).endTimeSource;
  return typeof source === 'string' ? source : null;
}

export function extractTripLifecycleTimestamps(
  input: TripLifecycleAuditTimestampsInput,
): TripLifecycleAuditTimestamps {
  const realEndAt = input.endTime?.toISOString() ?? null;
  const recognizedAt = readPersistedEndRecognizedAt(input.rawDetectionMeta);
  const realCompletedAt =
    input.tripStatus === TripStatus.COMPLETED && recognizedAt
      ? recognizedAt.toISOString()
      : null;
  const realRestingAt = input.restingObservedAt?.toISOString() ?? null;
  return { realEndAt, realCompletedAt, realRestingAt };
}

export type TripLifecycleAuditTimestampsInput = {
  endTime: Date | null;
  tripStatus: TripStatus;
  rawDetectionMeta: unknown;
  restingObservedAt: Date | null;
};

export function deriveProviderSilenceCounterfactualStatus(input: {
  shadow: ShadowTerminalSummary | null;
  minInactivityBeforeCusumMs: number;
  realEndAt: string | null;
  realWinningEndPath: string | null;
}): ProviderSilenceCounterfactualStatus {
  const ps = input.shadow?.providerSilence;
  if (!ps?.everEvaluated) return 'UNKNOWN';

  const anchorIso = ps.candidateAt ?? ps.firstEligibleAt;
  const endIso = input.realEndAt;
  if (
    input.realWinningEndPath &&
    !String(input.realWinningEndPath).includes('provider_silence') &&
    anchorIso &&
    endIso
  ) {
    const silenceMs =
      new Date(endIso).getTime() - new Date(anchorIso).getTime();
    if (silenceMs < input.minInactivityBeforeCusumMs) {
      return 'NOT_REACHED_BEFORE_TERMINAL';
    }
  }

  if (ps.everEligible) return 'OBSERVED_ELIGIBLE';
  if (
    (ps.blockedReasons?.length ?? 0) > 0 ||
    ps.lastEvaluation?.blockedBy
  ) {
    return 'OBSERVED_BLOCKED';
  }
  return 'UNKNOWN';
}

export function deriveShadowProviderSilenceCompetedWithStrongerPath(input: {
  shadow: ShadowTerminalSummary | null;
}): 'YES' | 'NO' | 'UNKNOWN' {
  const ps = input.shadow?.providerSilence;
  if (!ps?.everEvaluated) return 'UNKNOWN';
  if (
    ps.everEligible &&
    ps.realWinningEndPath &&
    !String(ps.realWinningEndPath).includes('provider_silence')
  ) {
    return 'YES';
  }
  if (ps.everEligible) return 'NO';
  return 'UNKNOWN';
}

export function deriveShadowFalseEndRiskObserved(input: {
  shadow: ShadowTerminalSummary | null;
}): 'YES' | 'NO' | 'UNKNOWN' {
  const ps = input.shadow?.providerSilence;
  if (!ps?.everEvaluated) return 'UNKNOWN';
  if (ps.invalidatedByMovement) return 'YES';
  if (
    (ps.blockedReasons ?? []).some((r) => r.includes('movement')) ||
    ps.lastEvaluation?.postCandidateMovementObserved
  ) {
    return 'YES';
  }
  if (ps.everEligible) return 'NO';
  return 'UNKNOWN';
}

export function deriveShadowCrossTripLeakObserved(input: {
  tripId: string;
  vehicleId: string;
  shadow: ShadowTerminalSummary | null;
  priorTripShadow: ShadowTerminalSummary | null;
  priorTripId: string | null;
  priorVehicleId: string | null;
}): 'YES' | 'NO' | 'UNKNOWN' {
  const ps = input.shadow?.providerSilence;
  if (!ps) return 'UNKNOWN';

  if (
    ps.candidateTripId &&
    ps.candidateTripId !== input.tripId
  ) {
    return 'YES';
  }

  if (
    input.priorTripShadow?.providerSilence.candidateTripId &&
    input.priorTripId &&
    input.priorTripId !== input.tripId &&
    input.priorVehicleId === input.vehicleId &&
    ps.candidateAt === input.priorTripShadow.providerSilence.candidateAt &&
    ps.candidateEndCycleGeneration ===
      input.priorTripShadow.providerSilence.candidateEndCycleGeneration
  ) {
    return 'YES';
  }

  if (ps.candidateTripId === input.tripId || !ps.candidateTripId) {
    return 'NO';
  }
  return 'UNKNOWN';
}

export function formatShadowAuditRow(
  trip: ShadowAuditTripInput,
  lifecycle: TripLifecycleAuditTimestamps,
  priorTrip?: {
    tripId: string;
    vehicleId: string;
    shadow: ShadowTerminalSummary | null;
  } | null,
): ShadowAuditRow {
  const shadow = readShadowFromRawMeta(trip.rawDetectionMeta);
  const ps = shadow?.providerSilence;
  const pa = shadow?.pauses;
  const realWinningEndPath = ps?.realWinningEndPath ?? readEndPath(trip.rawDetectionMeta);

  return {
    TRIP_ID: trip.tripId,
    START_AT: trip.startAt.toISOString(),
    END_AT: lifecycle.realEndAt,
    REAL_END_PATH: realWinningEndPath,
    REAL_COMPLETED_AT: lifecycle.realCompletedAt,
    REAL_RESTING_AT: lifecycle.realRestingAt,
    SHADOW_PROVIDER_SILENCE_EVALUATED: ps?.everEvaluated ?? false,
    SHADOW_PROVIDER_SILENCE_ELIGIBLE: ps?.everEligible ?? false,
    SHADOW_PROVIDER_SILENCE_FIRST_ELIGIBLE_AT: ps?.firstEligibleAt ?? null,
    SHADOW_PROVIDER_SILENCE_BLOCKED_BY: ps?.blockedReasons?.join('|') || null,
    SHADOW_PROVIDER_SILENCE_TRUST: ps?.trust ?? null,
    SHADOW_PROVIDER_SILENCE_CLOCK_AUTHORITY: ps?.clockAuthority ?? null,
    PROVIDER_SILENCE_COUNTERFACTUAL_STATUS: deriveProviderSilenceCounterfactualStatus({
      shadow,
      minInactivityBeforeCusumMs: 120_000,
      realEndAt: lifecycle.realEndAt,
      realWinningEndPath,
    }),
    SHADOW_PROVIDER_SILENCE_COMPETED_WITH_STRONGER_PATH:
      deriveShadowProviderSilenceCompetedWithStrongerPath({ shadow }),
    SHADOW_FALSE_END_RISK_OBSERVED: deriveShadowFalseEndRiskObserved({ shadow }),
    SHADOW_CROSS_TRIP_LEAK_OBSERVED: deriveShadowCrossTripLeakObserved({
      tripId: trip.tripId,
      vehicleId: trip.vehicleId,
      shadow,
      priorTripShadow: priorTrip?.shadow ?? null,
      priorTripId: priorTrip?.tripId ?? null,
      priorVehicleId: priorTrip?.vehicleId ?? null,
    }),
    PAUSE_EPISODE_COUNT: pa?.episodeCount ?? 0,
    LONGEST_PAUSE_SECONDS: pa?.longestPauseMs
      ? Math.round(pa.longestPauseMs / 1000)
      : 0,
    RESUME_COUNT: pa?.resumedEpisodeCount ?? 0,
    SAME_TRIP_RESUME_COUNT: pa?.sameTripResumeCount ?? 0,
    NEW_TRIP_AFTER_TERMINAL_COUNT: pa?.newTripAfterTerminalCount ?? 0,
    AMBIGUOUS_PAUSE_COUNT: pa?.ambiguousCount ?? 0,
  };
}

export function correlateConsecutiveTripPauses(
  trips: Array<
    ShadowAuditTripInput & {
      lifecycle: TripLifecycleAuditTimestamps;
      shadow: ShadowTerminalSummary | null;
    }
  >,
): CrossTripPauseCorrelation[] {
  const byVehicle = new Map<string, typeof trips>();
  for (const trip of trips) {
    const list = byVehicle.get(trip.vehicleId) ?? [];
    list.push(trip);
    byVehicle.set(trip.vehicleId, list);
  }

  const correlations: CrossTripPauseCorrelation[] = [];

  for (const [vehicleId, vehicleTrips] of byVehicle) {
    const sorted = [...vehicleTrips].sort(
      (a, b) => a.startAt.getTime() - b.startAt.getTime(),
    );

    for (let i = 0; i < sorted.length - 1; i += 1) {
      const prior = sorted[i]!;
      const next = sorted[i + 1]!;
      const priorShadow =
        prior.shadow ?? readShadowFromRawMeta(prior.rawDetectionMeta);

      if (prior.endTime == null) continue;
      if (next.startAt.getTime() < prior.endTime.getTime()) {
        correlations.push({
          priorTripId: prior.tripId,
          nextTripId: next.tripId,
          vehicleId,
          interTripPauseMs: null,
          crossTripPauseOutcome: 'AMBIGUOUS',
          priorPauseAnchorAt: null,
          priorCompletedAt: prior.lifecycle.realCompletedAt,
          priorRestingAt: prior.lifecycle.realRestingAt,
          nextTripStartAt: next.startAt.toISOString(),
          correlationConfidence: 'AMBIGUOUS',
        });
        continue;
      }

      const priorEpisodes = readShadowPauseEpisodes(priorShadow);
      const terminalNoResumeEpisode = priorEpisodes
        .slice()
        .reverse()
        .find((episode) => episode.shadowPauseOutcome === 'NO_RESUME_OBSERVED');
      const pauseAnchor =
        terminalNoResumeEpisode?.bestObservedStopAnchorAt ??
        terminalNoResumeEpisode?.episodeStartedAt ??
        prior.lifecycle.realEndAt;

      const interTripPauseMs =
        pauseAnchor != null
          ? next.startAt.getTime() - new Date(pauseAnchor).getTime()
          : null;

      let crossTripPauseOutcome: ShadowPauseOutcome | 'AMBIGUOUS' = 'AMBIGUOUS';
      if (prior.lifecycle.realRestingAt) {
        crossTripPauseOutcome = 'NEW_TRIP_AFTER_RESTING';
      } else if (prior.lifecycle.realCompletedAt) {
        crossTripPauseOutcome = 'NEW_TRIP_AFTER_COMPLETION';
      }

      correlations.push({
        priorTripId: prior.tripId,
        nextTripId: next.tripId,
        vehicleId,
        interTripPauseMs,
        crossTripPauseOutcome,
        priorPauseAnchorAt: pauseAnchor,
        priorCompletedAt: prior.lifecycle.realCompletedAt,
        priorRestingAt: prior.lifecycle.realRestingAt,
        nextTripStartAt: next.startAt.toISOString(),
        correlationConfidence:
          interTripPauseMs != null && crossTripPauseOutcome !== 'AMBIGUOUS'
            ? 'HIGH'
            : 'AMBIGUOUS',
      });
    }
  }

  return correlations;
}

export function validateShadowAuditCliArgs(input: {
  fixturesOnly: boolean;
  databaseUrl?: string;
  vehicleId?: string;
  since?: Date;
  until?: Date;
  allowUnbounded?: boolean;
}): { ok: true } | { ok: false; message: string } {
  if (input.fixturesOnly) return { ok: true };
  if (!input.databaseUrl?.trim()) {
    return {
      ok: false,
      message:
        'DATABASE_URL is required for real shadow audit. Use --fixtures-only for synthetic fixture mode.',
    };
  }
  if (input.allowUnbounded) return { ok: true };
  if (!input.vehicleId?.trim() || !input.since || !input.until) {
    return {
      ok: false,
      message:
        'Real audit requires --vehicle-id, --since, and --until (or --allow-unbounded for explicit broader scope).',
    };
  }
  return { ok: true };
}

export function aggregateShadowAuditRows(rows: ShadowAuditRow[]) {
  return {
    TOTAL_TRIPS: rows.length,
    PROVIDER_SILENCE_WOULD_HAVE_BEEN_NEEDED: rows.filter(
      (r) => r.SHADOW_PROVIDER_SILENCE_ELIGIBLE,
    ).length,
    PROVIDER_SILENCE_WOULD_HAVE_ADMITTED: rows.filter(
      (r) =>
        r.SHADOW_PROVIDER_SILENCE_ELIGIBLE &&
        r.SHADOW_PROVIDER_SILENCE_TRUST === false,
    ).length,
    PROVIDER_SILENCE_CORRECTLY_BLOCKED_BY_MOVEMENT: rows.filter((r) =>
      (r.SHADOW_PROVIDER_SILENCE_BLOCKED_BY ?? '').includes('movement'),
    ).length,
    SAME_TRIP_SHORT_PAUSES: rows.filter((r) => r.SAME_TRIP_RESUME_COUNT > 0)
      .length,
    NEW_TRIP_AFTER_TERMINAL: rows.filter(
      (r) => r.NEW_TRIP_AFTER_TERMINAL_COUNT > 0,
    ).length,
    AMBIGUOUS_EPISODES: rows.filter((r) => r.AMBIGUOUS_PAUSE_COUNT > 0).length,
    SHADOW_FALSE_END_RISK_YES: rows.filter(
      (r) => r.SHADOW_FALSE_END_RISK_OBSERVED === 'YES',
    ).length,
    SHADOW_CROSS_TRIP_LEAK_YES: rows.filter(
      (r) => r.SHADOW_CROSS_TRIP_LEAK_OBSERVED === 'YES',
    ).length,
  };
}
