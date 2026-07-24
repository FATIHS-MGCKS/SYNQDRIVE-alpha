import { describe, expect, it } from 'vitest';
import {
  formatTelemetryAgeShort,
  mergeGpsMeasuredAt,
  resolveTelemetryDisplayTime,
} from './telemetry-timestamp-semantics';
import { parseTelemetryTimestampMs } from './telemetryFreshness';

const NOW = new Date('2026-07-18T12:00:00.000Z').getTime();

describe('telemetry-timestamp-semantics', () => {
  it('parseTelemetryTimestampMs accepts unix seconds and ISO timezones', () => {
    expect(parseTelemetryTimestampMs(1_700_000_000)).toBe(1_700_000_000_000);
    expect(parseTelemetryTimestampMs('2026-07-18T10:00:00.000Z')).toBe(
      new Date('2026-07-18T10:00:00.000Z').getTime(),
    );
    expect(parseTelemetryTimestampMs('2026-07-18T12:00:00+02:00')).toBe(
      new Date('2026-07-18T10:00:00.000Z').getTime(),
    );
    expect(parseTelemetryTimestampMs('invalid')).toBeNull();
    expect(parseTelemetryTimestampMs(Number.NaN)).toBeNull();
  });

  it('fresh receipt does not rejuvenate stale provider measurement', () => {
    const measuredAt = new Date(NOW - 30 * 3_600_000).toISOString();
    const receivedAt = new Date(NOW).toISOString();
    const display = resolveTelemetryDisplayTime(
      { measuredAt, receivedAt },
      { now: NOW },
    );
    expect(display.freshness.freshness).toBe('signal_delayed');
    expect(display.freshness.isLive).toBe(false);
    expect(display.observedAtIso).toBe(measuredAt);
  });

  it('missing provider time stays no_signal even with fresh receipt', () => {
    const display = resolveTelemetryDisplayTime(
      { receivedAt: new Date(NOW).toISOString() },
      { now: NOW },
    );
    expect(display.freshness.freshness).toBe('no_signal');
    expect(formatTelemetryAgeShort(display.freshness)).toBe('—');
  });

  it('formatTelemetryAgeShort avoids just-now for non-live stale data', () => {
    const display = resolveTelemetryDisplayTime(
      { measuredAt: new Date(NOW - 3 * 3_600_000).toISOString() },
      { now: NOW },
    );
    expect(display.freshness.isLive).toBe(false);
    expect(formatTelemetryAgeShort(display.freshness, 'en')).toBe('3h ago');
  });

  it('mergeGpsMeasuredAt updates measurement only for dimo source', () => {
    const measuredAt = new Date(NOW - 5 * 60_000).toISOString();
    const merged = mergeGpsMeasuredAt(
      { measuredAt: null, lastSignal: '' },
      {
        source: 'dimo',
        measuredAt,
        receivedAt: new Date(NOW).toISOString(),
      },
    );
    expect(merged.measuredAt).toBe(measuredAt);
    expect(merged.lastSignal).toBe(measuredAt);

    const unchanged = mergeGpsMeasuredAt(merged, { source: 'cache', measuredAt: new Date(NOW).toISOString() });
    expect(unchanged.measuredAt).toBe(measuredAt);
  });

  it('out-of-order: older provider time wins over newer receipt', () => {
    const older = new Date(NOW - 49 * 3_600_000).toISOString();
    const display = resolveTelemetryDisplayTime(
      {
        measuredAt: older,
        receivedAt: new Date(NOW).toISOString(),
      },
      { now: NOW },
    );
    expect(display.freshness.freshness).toBe('offline');
    expect(display.freshness.shouldWarnUser).toBe(true);
  });
});
