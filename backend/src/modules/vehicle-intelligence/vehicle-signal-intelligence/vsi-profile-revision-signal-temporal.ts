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
  const evidenceMs =
    sourceMs != null && validMs != null
      ? Math.min(sourceMs, validMs)
      : sourceMs ?? validMs;

  if (evidenceMs == null || !Number.isFinite(evidenceMs)) {
    return VsiProfileRevisionSignalTemporalState.MISSING_TEMPORAL_PROVENANCE;
  }
  if (evidenceMs > input.decisionAtMs) {
    return VsiProfileRevisionSignalTemporalState.FUTURE_SIGNAL_EVIDENCE;
  }
  return VsiProfileRevisionSignalTemporalState.VALID_PAST_SIGNAL_EVIDENCE;
}
