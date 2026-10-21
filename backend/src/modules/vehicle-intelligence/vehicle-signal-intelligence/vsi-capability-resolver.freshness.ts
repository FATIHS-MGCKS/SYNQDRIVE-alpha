import { classifyTelemetryFreshness } from '../../vehicles/vehicle-state-interpreter';

export function parseSignalTimestampMs(
  lastSourceTimestamp: string | null,
): number | null {
  if (!lastSourceTimestamp) {
    return null;
  }
  const ms = Date.parse(lastSourceTimestamp);
  return Number.isFinite(ms) ? ms : null;
}

export function isSignalTimestampValidAtEvaluation(
  lastSourceTimestamp: string | null,
  evaluationTimeMs: number,
): boolean {
  const ms = parseSignalTimestampMs(lastSourceTimestamp);
  if (ms == null) {
    return false;
  }
  return ms <= evaluationTimeMs;
}

export function computeSignalFreshnessAtEvaluation(input: {
  lastSourceTimestamp: string | null;
  evaluationTimeMs: number;
}): 'FRESH' | 'STALE' | 'UNKNOWN' {
  const ms = parseSignalTimestampMs(input.lastSourceTimestamp);
  if (ms == null) {
    return 'UNKNOWN';
  }
  if (ms > input.evaluationTimeMs) {
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
