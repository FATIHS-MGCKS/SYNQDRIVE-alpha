export const VEHICLE_TELEMETRY_RETRY = {
  MAX_ATTEMPTS: 4,
  BASE_MS: 2_000,
  MAX_BACKOFF_MS: 60_000,
  JITTER_RATIO: 0.2,
  /** Consecutive failures before surfacing a user-visible degraded state. */
  ERROR_SURFACE_AFTER: 2,
  GPS_FETCH_TIMEOUT_MS: 20_000,
  DASHBOARD_FETCH_TIMEOUT_MS: 25_000,
} as const;

export function computeTelemetryBackoffMs(
  attempt: number,
  retryAfterMs?: number,
): number {
  if (retryAfterMs != null && retryAfterMs > 0) {
    return Math.min(retryAfterMs, VEHICLE_TELEMETRY_RETRY.MAX_BACKOFF_MS);
  }
  const exponent = Math.max(0, attempt);
  const base = Math.min(
    VEHICLE_TELEMETRY_RETRY.BASE_MS * 2 ** exponent,
    VEHICLE_TELEMETRY_RETRY.MAX_BACKOFF_MS,
  );
  const jitterSpan = base * VEHICLE_TELEMETRY_RETRY.JITTER_RATIO;
  const jitter = (Math.random() * 2 - 1) * jitterSpan;
  return Math.max(0, Math.round(base + jitter));
}

export function isRetryableTelemetryHttpStatus(status: number): boolean {
  if (status === 401 || status === 403 || status === 404) return false;
  if (status === 429) return true;
  if (status >= 500) return true;
  return false;
}
