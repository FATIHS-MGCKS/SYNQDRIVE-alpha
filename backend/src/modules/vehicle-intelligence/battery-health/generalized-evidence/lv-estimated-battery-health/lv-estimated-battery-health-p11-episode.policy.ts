import type { LvOperationalConditionObservationV1 } from '../lv-operational-condition/lv-operational-condition-v1.types';
import {
  hasVerifiedRestStabilization,
  isEligibleRestObservationForConditionV1,
  observationProviderEventTimeMs,
} from '../lv-operational-condition/lv-operational-condition-observation.policy';
import {
  P11_HEARTBEAT_NOMINAL_HOURS,
  P11_HEARTBEAT_RUNG_TOLERANCE_HOURS,
  P11_MIN_EPISODE_REST_AGE_HOURS,
  P11_PRE_START_FOLLOW_UP_MS,
  P11_STABLE_REST_MIN_AGE_HOURS,
} from './lv-estimated-battery-health-p11.constants';

export type P11EpisodeStabilityClass =
  | 'STABLE_LONG_REST'
  | 'STABLE_HEARTBEAT_RUNG'
  | 'SHORT_REST_ANALYZED'
  | 'PRE_START_WAKE_SUSPECT';

export type P11QualifiedEpisodeV1 = LvOperationalConditionObservationV1 & {
  stabilityClass: P11EpisodeStabilityClass;
  /** Voltage chosen for the episode (median-of-candidates), not necessarily the raw observation row. */
  representativeVoltageV: number;
  preStartWakeSuspect: boolean;
};

export type P11LowVoltageRestEventV1 = {
  observationId: string;
  restSessionId: string | null;
  voltageV: number;
  voltageObservedAt: string;
  actualRestAgeHours: number | null;
  stabilityClass: P11EpisodeStabilityClass;
  preStartWakeSuspect: boolean;
  /** Retained for audit even when excluded from stable baseline. */
  retainedAsLowVoltageEvidence: boolean;
};

export type P11EpisodeSelectionTraceV1 = {
  sessionsConsidered: number;
  sessionsWithStableCandidate: number;
  sessionsPreStartSuspectOnly: number;
  lowVoltageEventCount: number;
  selectionPolicy: 'P11_MEDIAN_OF_STABLE_CANDIDATES_THEN_SHORT_REST';
};

function episodeGroupKey(obs: LvOperationalConditionObservationV1): string {
  const session = obs.restSessionId?.trim();
  if (session) return `session:${session}`;
  return `measurement:${obs.sourceMeasurementId}`;
}

function isNearHeartbeatRung(restAgeHours: number): boolean {
  if (restAgeHours < P11_STABLE_REST_MIN_AGE_HOURS) return false;
  for (let rung = 1; rung <= 6; rung += 1) {
    const nominal = rung * P11_HEARTBEAT_NOMINAL_HOURS;
    if (Math.abs(restAgeHours - nominal) <= P11_HEARTBEAT_RUNG_TOLERANCE_HOURS) {
      return true;
    }
  }
  return false;
}

function followUpIndicatesPreStartWake(
  restPoint: LvOperationalConditionObservationV1,
  timeline: LvOperationalConditionObservationV1[],
  evaluationHorizonMs: number,
): boolean {
  const t0 = observationProviderEventTimeMs(restPoint);
  if (!Number.isFinite(t0) || !Number.isFinite(evaluationHorizonMs) || t0 > evaluationHorizonMs) {
    return false;
  }
  const followEndMs = Math.min(t0 + P11_PRE_START_FOLLOW_UP_MS, evaluationHorizonMs);
  for (const next of timeline) {
    const tNext = observationProviderEventTimeMs(next);
    if (tNext <= t0) continue;
    if (tNext > followEndMs) break;
    if (next.isLvCharging === true) return true;
    if (next.engineRunning === true) return true;
    if (next.evidenceClass === 'CHARGING_CONTAMINATED') return true;
    if (next.operationalContext === 'CHARGING' || next.operationalContext === 'DRIVING') {
      return true;
    }
  }
  return false;
}

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function pickObservationClosestToVoltage(
  candidates: LvOperationalConditionObservationV1[],
  targetV: number,
): LvOperationalConditionObservationV1 {
  return [...candidates].sort((a, b) => {
    const da = Math.abs(a.voltageV - targetV);
    const db = Math.abs(b.voltageV - targetV);
    if (da !== db) return da - db;
    return observationProviderEventTimeMs(b) - observationProviderEventTimeMs(a);
  })[0];
}

function classifyStability(
  obs: LvOperationalConditionObservationV1,
  preStart: boolean,
): P11EpisodeStabilityClass {
  if (preStart) return 'PRE_START_WAKE_SUSPECT';
  const age = obs.actualRestAgeHours ?? 0;
  if (age >= P11_STABLE_REST_MIN_AGE_HOURS) return 'STABLE_LONG_REST';
  if (isNearHeartbeatRung(age)) return 'STABLE_HEARTBEAT_RUNG';
  return 'SHORT_REST_ANALYZED';
}

/**
 * P11-only episode assembly. Does not replace N14 `selectEpisodeRepresentativesForOperationalRisk`.
 */
export function selectP11EpisodeRepresentatives(input: {
  eligibleRestObservations: LvOperationalConditionObservationV1[];
  assessmentTimelineObservations: LvOperationalConditionObservationV1[];
  /** Provider-event horizon for as-of integrity (inclusive). Required for shadow replay. */
  evaluatedAtIso?: string;
  lowVoltageThresholdV?: number;
}): {
  episodes: P11QualifiedEpisodeV1[];
  lowVoltageEvents: P11LowVoltageRestEventV1[];
  trace: P11EpisodeSelectionTraceV1;
} {
  const evalMs = input.evaluatedAtIso ? Date.parse(input.evaluatedAtIso) : Number.POSITIVE_INFINITY;
  const visibleAtEval = (obs: LvOperationalConditionObservationV1): boolean => {
    const t = observationProviderEventTimeMs(obs);
    return Number.isFinite(evalMs) ? Number.isFinite(t) && t <= evalMs : true;
  };
  const timeline = [...input.assessmentTimelineObservations]
    .filter(visibleAtEval)
    .sort((a, b) => observationProviderEventTimeMs(a) - observationProviderEventTimeMs(b));
  const eligible = input.eligibleRestObservations
    .filter(isEligibleRestObservationForConditionV1)
    .filter(visibleAtEval);
  const lowVoltageThresholdV = input.lowVoltageThresholdV ?? 12.2;

  const bySession = new Map<string, LvOperationalConditionObservationV1[]>();
  for (const obs of eligible) {
    const age = obs.actualRestAgeHours;
    if (age == null || age < P11_MIN_EPISODE_REST_AGE_HOURS) continue;
    const key = episodeGroupKey(obs);
    const list = bySession.get(key) ?? [];
    list.push(obs);
    bySession.set(key, list);
  }

  const episodes: P11QualifiedEpisodeV1[] = [];
  const lowVoltageEvents: P11LowVoltageRestEventV1[] = [];
  let sessionsWithStable = 0;
  let sessionsPreStartOnly = 0;

  for (const [, sessionPoints] of bySession) {
    const sorted = [...sessionPoints].sort(
      (a, b) => observationProviderEventTimeMs(a) - observationProviderEventTimeMs(b),
    );
    const annotated = sorted.map((obs) => {
      const preStart = followUpIndicatesPreStartWake(obs, timeline, evalMs);
      return { obs, preStart };
    });

    for (const { obs, preStart } of annotated) {
      const stability = classifyStability(obs, preStart);
      const isLow = obs.voltageV < lowVoltageThresholdV;
      if (isLow || preStart || stability === 'PRE_START_WAKE_SUSPECT') {
        lowVoltageEvents.push({
          observationId: obs.observationId,
          restSessionId: obs.restSessionId,
          voltageV: obs.voltageV,
          voltageObservedAt: obs.voltageObservedAt,
          actualRestAgeHours: obs.actualRestAgeHours,
          stabilityClass: stability,
          preStartWakeSuspect: preStart,
          retainedAsLowVoltageEvidence: true,
        });
      }
    }

    const stablePool = annotated
      .filter(({ obs, preStart }) => !preStart && (obs.actualRestAgeHours ?? 0) >= P11_STABLE_REST_MIN_AGE_HOURS)
      .map(({ obs }) => obs);
    const heartbeatPool = annotated
      .filter(({ obs, preStart }) => !preStart && isNearHeartbeatRung(obs.actualRestAgeHours ?? 0))
      .map(({ obs }) => obs);
    const shortPool = annotated.filter(({ preStart }) => !preStart).map(({ obs }) => obs);

    let candidatePool: LvOperationalConditionObservationV1[];
    let stabilityClass: P11EpisodeStabilityClass;
    if (stablePool.length > 0) {
      candidatePool = stablePool;
      stabilityClass = 'STABLE_LONG_REST';
      sessionsWithStable += 1;
    } else if (heartbeatPool.length > 0) {
      candidatePool = heartbeatPool;
      stabilityClass = 'STABLE_HEARTBEAT_RUNG';
      sessionsWithStable += 1;
    } else if (shortPool.length > 0) {
      candidatePool = shortPool;
      stabilityClass = 'SHORT_REST_ANALYZED';
    } else {
      const fallback = annotated[annotated.length - 1];
      candidatePool = [fallback.obs];
      stabilityClass = 'PRE_START_WAKE_SUSPECT';
      sessionsPreStartOnly += 1;
    }

    const repV = median(candidatePool.map((o) => o.voltageV));
    const repObs = pickObservationClosestToVoltage(candidatePool, repV);
    episodes.push({
      ...repObs,
      representativeVoltageV: repV,
      stabilityClass,
      preStartWakeSuspect: stabilityClass === 'PRE_START_WAKE_SUSPECT',
    });
  }

  episodes.sort((a, b) => observationProviderEventTimeMs(a) - observationProviderEventTimeMs(b));

  return {
    episodes,
    lowVoltageEvents,
    trace: {
      sessionsConsidered: bySession.size,
      sessionsWithStableCandidate: sessionsWithStable,
      sessionsPreStartSuspectOnly: sessionsPreStartOnly,
      lowVoltageEventCount: lowVoltageEvents.length,
      selectionPolicy: 'P11_MEDIAN_OF_STABLE_CANDIDATES_THEN_SHORT_REST',
    },
  };
}

/** @internal Exported for tests — P1 uses latest-per-session; P11 uses stable median representative. */
export function selectP1StyleLatestPerSessionEpisodes(
  eligibleRest: LvOperationalConditionObservationV1[],
): LvOperationalConditionObservationV1[] {
  const eligible = eligibleRest.filter(isEligibleRestObservationForConditionV1);
  const byEpisode = new Map<string, LvOperationalConditionObservationV1>();
  for (const obs of eligible) {
    if (!hasVerifiedRestStabilization(obs)) continue;
    const key = episodeGroupKey(obs);
    const existing = byEpisode.get(key);
    if (!existing || observationProviderEventTimeMs(obs) >= observationProviderEventTimeMs(existing)) {
      byEpisode.set(key, obs);
    }
  }
  return [...byEpisode.values()].sort(
    (a, b) => observationProviderEventTimeMs(a) - observationProviderEventTimeMs(b),
  );
}
