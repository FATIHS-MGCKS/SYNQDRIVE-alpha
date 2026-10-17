import { parseSignalTimestampMs } from './vsi-capability-resolver.freshness';

export const VsiProfileRevisionSignalTemporalState = {
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  VALID_PAST_SIGNAL_EVIDENCE: 'VALID_PAST_SIGNAL_EVIDENCE',
  FUTURE_SIGNAL_EVIDENCE: 'FUTURE_SIGNAL_EVIDENCE',
  MISSING_TEMPORAL_PROVENANCE: 'MISSING_TEMPORAL_PROVENANCE',
} as const;

export type VsiProfileRevisionSignalTemporalState =
  (typeof VsiProfileRevisionSignalTemporalState)[keyof typeof VsiProfileRevisionSignalTemporalState];

const EMPIRICAL_REQUIRES_PROVENANCE = new Set(['OBSERVED', 'OBSERVED_STALE']);

/**
 * Each present empirical timestamp is evaluated independently — timestamps cannot mask each other.
 */
export function assessVsiProfileRevisionSignalTemporalState(input: {
  empiricalObservation: string;
  lastSourceTimestamp: string | null;
  lastValidObservationAt: string | null;
  decisionAtMs: number;
}): VsiProfileRevisionSignalTemporalState {
  if (!EMPIRICAL_REQUIRES_PROVENANCE.has(input.empiricalObservation)) {
    return VsiProfileRevisionSignalTemporalState.NOT_APPLICABLE;
  }

  const sourceMs = parseSignalTimestampMs(input.lastSourceTimestamp);
  const validMs = parseSignalTimestampMs(input.lastValidObservationAt);

  if (sourceMs != null && sourceMs > input.decisionAtMs) {
    return VsiProfileRevisionSignalTemporalState.FUTURE_SIGNAL_EVIDENCE;
  }
  if (validMs != null && validMs > input.decisionAtMs) {
    return VsiProfileRevisionSignalTemporalState.FUTURE_SIGNAL_EVIDENCE;
  }

  const hasSource = sourceMs != null && Number.isFinite(sourceMs);
  const hasValid = validMs != null && Number.isFinite(validMs);

  if (!hasSource && !hasValid) {
    return VsiProfileRevisionSignalTemporalState.MISSING_TEMPORAL_PROVENANCE;
  }
  if (!hasSource || !hasValid) {
    return VsiProfileRevisionSignalTemporalState.MISSING_TEMPORAL_PROVENANCE;
  }

  return VsiProfileRevisionSignalTemporalState.VALID_PAST_SIGNAL_EVIDENCE;
}
