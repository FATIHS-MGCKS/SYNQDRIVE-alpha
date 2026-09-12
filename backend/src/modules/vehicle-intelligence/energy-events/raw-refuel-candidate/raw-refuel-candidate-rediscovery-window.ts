import { RAW_REFUEL_CANDIDATE_REDISCOVERY_LOOKBACK_MS } from './raw-refuel-candidate.constants';
import type { RawRefuelCandidateObservation } from './raw-refuel-candidate.types';

export interface RawRefuelCandidateRediscoveryWindow {
  start: Date;
  end: Date;
}

/**
 * Bounded semantic search window for rediscovery queries.
 * Anchored on observation physical/rise/scan evidence with symmetric lookback.
 */
export function computeRawRefuelCandidateRediscoveryWindow(
  observation: RawRefuelCandidateObservation,
  serviceNow: Date,
): RawRefuelCandidateRediscoveryWindow {
  const anchorTimes = [
    observation.riseOnsetAt,
    observation.riseEndAt,
    observation.physicalEvidenceStart,
    observation.physicalEvidenceEnd,
    observation.scanWindowStart,
    observation.scanWindowEnd,
    serviceNow,
  ].filter((value): value is Date => value instanceof Date);

  const earliest = new Date(Math.min(...anchorTimes.map((value) => value.getTime())));
  const latest = new Date(Math.max(...anchorTimes.map((value) => value.getTime())));

  return {
    start: new Date(earliest.getTime() - RAW_REFUEL_CANDIDATE_REDISCOVERY_LOOKBACK_MS),
    end: new Date(latest.getTime() + RAW_REFUEL_CANDIDATE_REDISCOVERY_LOOKBACK_MS),
  };
}
