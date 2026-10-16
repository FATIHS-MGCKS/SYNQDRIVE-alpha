import { classifyTelemetryFreshness } from '../../vehicles/vehicle-state-interpreter';

export function computeSignalFreshnessAtEvaluation(input: {
  lastSourceTimestamp: string | null;
  evaluationTimeMs: number;
}): 'FRESH' | 'STALE' | 'UNKNOWN' {
  if (!input.lastSourceTimestamp) {
    return 'UNKNOWN';
  }
  const ms = Date.parse(input.lastSourceTimestamp);
  if (!Number.isFinite(ms)) {
    return 'UNKNOWN';
  }
  const bucket = classifyTelemetryFreshness(new Date(ms), input.evaluationTimeMs);
  if (bucket === 'live' || bucket === 'standby') {
    return 'FRESH';
  }
  if (bucket === 'signal_delayed' || bucket === 'offline') {
    return 'STALE';
  }
  return 'UNKNOWN';
}
