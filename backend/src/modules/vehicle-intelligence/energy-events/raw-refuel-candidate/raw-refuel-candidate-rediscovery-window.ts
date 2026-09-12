import { RAW_REFUEL_CANDIDATE_REDISCOVERY_LOOKBACK_MS } from './raw-refuel-candidate.constants';
import type { RawRefuelCandidateObservation } from './raw-refuel-candidate.types';

export interface RawRefuelCandidateRediscoveryWindow {
  start: Date;
  end: Date;
}

function collectEvidenceAnchorTimes(
  observation: RawRefuelCandidateObservation,
): Date[] {
  return [
    observation.riseOnsetAt,
    observation.riseEndAt,
    observation.physicalEvidenceStart,
    observation.physicalEvidenceEnd,
    observation.scanWindowStart,
    observation.scanWindowEnd,
  ].filter((value): value is Date => value instanceof Date);
}

/**
 * Bounded semantic search window for rediscovery queries.
 * Anchored on observation physical/rise/scan evidence only; serviceNow is fallback
 * when no evidence timestamp exists.
 */
export function computeRawRefuelCandidateRediscoveryWindow(
  observation: RawRefuelCandidateObservation,
  serviceNow: Date,
): RawRefuelCandidateRediscoveryWindow {
  const evidenceAnchors = collectEvidenceAnchorTimes(observation);

  const earliest =
    evidenceAnchors.length > 0
      ? new Date(Math.min(...evidenceAnchors.map((value) => value.getTime())))
      : serviceNow;
  const latest =
    evidenceAnchors.length > 0
      ? new Date(Math.max(...evidenceAnchors.map((value) => value.getTime())))
      : serviceNow;

  return {
    start: new Date(earliest.getTime() - RAW_REFUEL_CANDIDATE_REDISCOVERY_LOOKBACK_MS),
    end: new Date(latest.getTime() + RAW_REFUEL_CANDIDATE_REDISCOVERY_LOOKBACK_MS),
  };
}

export { collectEvidenceAnchorTimes };
