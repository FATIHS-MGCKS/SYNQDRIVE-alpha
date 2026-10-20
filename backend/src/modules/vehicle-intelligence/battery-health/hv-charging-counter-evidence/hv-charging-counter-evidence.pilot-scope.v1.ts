import type { HvChargeSessionPersistResult } from '../hv-charge-session/hv-charge-session.types';

/** Pilot hard cap — one provider session per reconcile wave. */
export const HV_CHARGING_COUNTER_PILOT_MAX_SESSIONS_PER_RECONCILE_V1 = 1;

export function selectHvChargingCounterPilotSessionsV1(
  results: HvChargeSessionPersistResult[],
  maxSessions: number = HV_CHARGING_COUNTER_PILOT_MAX_SESSIONS_PER_RECONCILE_V1,
): {
  selected: HvChargeSessionPersistResult[];
  deferredCount: number;
} {
  const cap = Math.max(0, Math.min(maxSessions, HV_CHARGING_COUNTER_PILOT_MAX_SESSIONS_PER_RECONCILE_V1));
  if (cap === 0 || results.length === 0) {
    return { selected: [], deferredCount: results.length };
  }

  const sorted = [...results].sort((a, b) => {
    const changedScore = (b.changed ? 1 : 0) - (a.changed ? 1 : 0);
    if (changedScore !== 0) return changedScore;
    return b.session.startAt.getTime() - a.session.startAt.getTime();
  });

  return {
    selected: sorted.slice(0, cap),
    deferredCount: Math.max(0, sorted.length - cap),
  };
}
