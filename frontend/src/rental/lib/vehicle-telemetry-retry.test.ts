import { describe, expect, it, vi } from 'vitest';
import {
  computeTelemetryBackoffMs,
  isRetryableTelemetryHttpStatus,
  VEHICLE_TELEMETRY_RETRY,
} from './vehicle-telemetry-retry';

describe('vehicle-telemetry-retry', () => {
  it('respects Retry-After capped at MAX_BACKOFF_MS', () => {
    expect(computeTelemetryBackoffMs(1, 120_000)).toBe(
      VEHICLE_TELEMETRY_RETRY.MAX_BACKOFF_MS,
    );
    expect(computeTelemetryBackoffMs(1, 5_000)).toBe(5_000);
  });

  it('applies exponential backoff with jitter bounds', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const delay = computeTelemetryBackoffMs(2);
    expect(delay).toBeGreaterThanOrEqual(VEHICLE_TELEMETRY_RETRY.BASE_MS * 4);
    expect(delay).toBeLessThanOrEqual(VEHICLE_TELEMETRY_RETRY.MAX_BACKOFF_MS);
    vi.restoreAllMocks();
  });

  it('classifies retryable HTTP statuses', () => {
    expect(isRetryableTelemetryHttpStatus(401)).toBe(false);
    expect(isRetryableTelemetryHttpStatus(403)).toBe(false);
    expect(isRetryableTelemetryHttpStatus(404)).toBe(false);
    expect(isRetryableTelemetryHttpStatus(429)).toBe(true);
    expect(isRetryableTelemetryHttpStatus(500)).toBe(true);
    expect(isRetryableTelemetryHttpStatus(418)).toBe(false);
  });
});
