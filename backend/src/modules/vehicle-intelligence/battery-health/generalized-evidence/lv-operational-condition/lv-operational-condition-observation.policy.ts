import type { LvOperationalConditionObservationV1 } from './lv-operational-condition-v1.types';
import { LV_OPERATIONAL_MIN_REST_AGE_HOURS } from './lv-operational-condition-v1.constants';
import {
  dedupeKeyForObservationRow,
  dedupeObservationsBySourceMeasurementId,
} from '../lv-measured-intelligence/lv-measured-intelligence-dedup.policy';

/** Provider event time when present; otherwise ingestion/voltage timestamp. */
export function observationProviderEventTimeMs(obs: LvOperationalConditionObservationV1): number {
  const providerAt = obs.providerObservationAt?.trim();
  if (providerAt) {
    const t = Date.parse(providerAt);
    if (Number.isFinite(t)) return t;
  }
  const t = Date.parse(obs.voltageObservedAt);
  return Number.isFinite(t) ? t : 0;
}

export function isEligibleRestObservationForConditionV1(
  obs: LvOperationalConditionObservationV1,
): boolean {
  if (obs.operationalContext === 'CHARGING' || obs.isLvCharging === true) {
    return false;
  }
  if (obs.operationalContext === 'DRIVING' || obs.engineRunning === true) {
    return false;
  }
  if (obs.operationalContext !== 'REST') {
    return false;
  }
  if (!Number.isFinite(obs.voltageV) || obs.voltageV < 9 || obs.voltageV > 16) {
    return false;
  }
  return true;
}

export function hasVerifiedRestStabilization(obs: LvOperationalConditionObservationV1): boolean {
  return (
    obs.actualRestAgeHours != null &&
    Number.isFinite(obs.actualRestAgeHours) &&
    obs.actualRestAgeHours >= LV_OPERATIONAL_MIN_REST_AGE_HOURS
  );
}

export function dedupeConditionObservationsBySourceMeasurementId(
  observations: LvOperationalConditionObservationV1[],
): LvOperationalConditionObservationV1[] {
  const rows = observations.map((obs) => ({
    ...obs,
    id: obs.observationId,
    voltageObservedAt: obs.voltageObservedAt ? new Date(obs.voltageObservedAt) : null,
    createdAt: new Date(obs.voltageObservedAt || 0),
  }));
  const deduped = dedupeObservationsBySourceMeasurementId(rows);
  const byId = new Map(observations.map((o) => [o.observationId, o]));
  return deduped.map((row) => byId.get(row.id)!).filter(Boolean);
}

function episodeGroupKey(obs: LvOperationalConditionObservationV1): string {
  const session = obs.restSessionId?.trim();
  if (session) return `session:${session}`;
  return `measurement:${dedupeKeyForObservationRow({
    id: obs.observationId,
    sourceMeasurementId: obs.sourceMeasurementId,
    voltageObservedAt: obs.voltageObservedAt ? new Date(obs.voltageObservedAt) : null,
    createdAt: new Date(obs.voltageObservedAt || 0),
  })}`;
}

/**
 * One representative per REST episode (latest provider-time eligible point with verified rest age).
 * Prevents multiple points from the same parked rest from inflating sample count.
 */
export function selectEpisodeRepresentativesForOperationalRisk(
  eligibleRest: LvOperationalConditionObservationV1[],
): LvOperationalConditionObservationV1[] {
  const eligible = eligibleRest.filter(isEligibleRestObservationForConditionV1);
  const byEpisode = new Map<string, LvOperationalConditionObservationV1>();

  for (const obs of eligible) {
    if (!hasVerifiedRestStabilization(obs)) continue;
    const key = episodeGroupKey(obs);
    const existing = byEpisode.get(key);
    if (!existing) {
      byEpisode.set(key, obs);
      continue;
    }
    if (observationProviderEventTimeMs(obs) >= observationProviderEventTimeMs(existing)) {
      byEpisode.set(key, obs);
    }
  }

  return [...byEpisode.values()].sort(
    (a, b) => observationProviderEventTimeMs(a) - observationProviderEventTimeMs(b),
  );
}

export function selectLatestEligibleRestObservation(
  eligibleRest: LvOperationalConditionObservationV1[],
): LvOperationalConditionObservationV1 | null {
  const eligible = eligibleRest.filter(isEligibleRestObservationForConditionV1);
  if (eligible.length === 0) return null;
  const sorted = [...eligible].sort(
    (a, b) => observationProviderEventTimeMs(b) - observationProviderEventTimeMs(a),
  );
  return sorted[0] ?? null;
}

export function medianRestVoltageMv(observations: LvOperationalConditionObservationV1[]): number | null {
  if (observations.length === 0) return null;
  const sorted = observations.map((o) => o.voltageV * 1000).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}
