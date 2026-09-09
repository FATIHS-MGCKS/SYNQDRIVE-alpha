/**
 * Telemetry fetch outcome taxonomy (TDL-DEC-R11-001).
 * Errors must not be coerced into successful empty streams.
 */
export type TripTelemetryFetchOutcome =
  | 'SUCCESS_WITH_DATA'
  | 'SUCCESS_EMPTY'
  | 'FETCH_ERROR';

export type TripTelemetryFetchErrorClass =
  | 'TIMEOUT'
  | 'NETWORK'
  | 'RATE_LIMIT'
  | 'AUTH'
  | 'PERMISSION'
  | 'UNKNOWN';

export function classifyFetchError(err: unknown): TripTelemetryFetchErrorClass {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes('403') || msg.includes('forbidden') || msg.includes('permission')) {
    return 'PERMISSION';
  }
  if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('auth')) {
    return 'AUTH';
  }
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many')) {
    return 'RATE_LIMIT';
  }
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('etimedout')) {
    return 'TIMEOUT';
  }
  if (msg.includes('network') || msg.includes('econn') || msg.includes('enotfound')) {
    return 'NETWORK';
  }
  return 'UNKNOWN';
}

export function coreFetchOutcome(pointCount: number): TripTelemetryFetchOutcome {
  return pointCount > 0 ? 'SUCCESS_WITH_DATA' : 'SUCCESS_EMPTY';
}
