import { M3_3_HV_H4_CHARGE_SESSION_LOAD_HARD_LIMIT } from './m3-3-hv-h4.constants';
import type { M3_3HvH4ChargeSessionScientificRowV1 } from './m3-3-hv-h4-charge-session-scientific-row.v1';

export interface M3_3HvH4ChargeSessionSourcePopulationV1 {
  sessions: M3_3HvH4ChargeSessionScientificRowV1[];
  sourceLoad: {
    loadedCount: number;
    hardLimit: number;
    sourceTruncated: boolean;
    hardLimitReached: boolean;
  };
}

/**
 * Shared A1 population semantics: startAt <= evaluationAt, order startAt ASC + id ASC, hard limit 5000 + probe.
 * Used by live DB pagination and durable MODE_A reconstruction (post revision collapse).
 */
export function applyM3_3HvH4ChargeSessionSourcePopulationV1(input: {
  sessions: M3_3HvH4ChargeSessionScientificRowV1[];
  evaluationAt: Date;
}): M3_3HvH4ChargeSessionSourcePopulationV1 {
  const filtered = input.sessions.filter((s) => s.startAt.getTime() <= input.evaluationAt.getTime());
  filtered.sort((a, b) => {
    const startDiff = a.startAt.getTime() - b.startAt.getTime();
    if (startDiff !== 0) return startDiff;
    return a.id.localeCompare(b.id);
  });

  const hardLimit = M3_3_HV_H4_CHARGE_SESSION_LOAD_HARD_LIMIT;
  const withinLimit = filtered.slice(0, hardLimit);
  const sourceTruncated = filtered.length > hardLimit;
  const hardLimitReached = sourceTruncated;

  return {
    sessions: withinLimit,
    sourceLoad: {
      loadedCount: withinLimit.length,
      hardLimit,
      sourceTruncated,
      hardLimitReached,
    },
  };
}
