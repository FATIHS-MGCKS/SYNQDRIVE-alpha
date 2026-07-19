import {
  DEFAULT_TELEMETRY_BACKFILL_MAX_LAG_MS,
  resolveCanonicalTelemetryObservedAtMs,
  resolveTelemetryFreshness,
  mapTelemetryFreshnessToLegacyConnectionStatus,
  legacyConnectionStatusNote,
  TELEMETRY_FRESH_THRESHOLD_MS,
  TELEMETRY_SIGNAL_DELAYED_THRESHOLD_MS,
  TELEMETRY_STANDBY_THRESHOLD_MS,
} from './telemetry-freshness.resolver';

const NOW_MS = new Date('2026-07-18T12:00:00.000Z').getTime();

function hoursAgo(h: number): number {
  return NOW_MS - h * 3_600_000;
}

function minutesAgo(m: number): number {
  return NOW_MS - m * 60_000;
}

describe('telemetry-freshness.resolver', () => {
  describe('threshold constants', () => {
    it('matches canonical 15m / 24h / 48h boundaries', () => {
      expect(TELEMETRY_FRESH_THRESHOLD_MS).toBe(15 * 60 * 1000);
      expect(TELEMETRY_STANDBY_THRESHOLD_MS).toBe(24 * 60 * 60 * 1000);
      expect(TELEMETRY_SIGNAL_DELAYED_THRESHOLD_MS).toBe(48 * 60 * 60 * 1000);
    });
  });

  describe('resolveTelemetryFreshness boundaries', () => {
    it.each([
      { label: '0 minutes', ageMs: 0, expected: 'live' as const },
      { label: 'live edge', ageMs: TELEMETRY_FRESH_THRESHOLD_MS - 1, expected: 'live' as const },
      { label: '23:59h', ageMs: TELEMETRY_STANDBY_THRESHOLD_MS - 60_000, expected: 'standby' as const },
      { label: '24h', ageMs: TELEMETRY_STANDBY_THRESHOLD_MS, expected: 'signal_delayed' as const },
      { label: '47:59h', ageMs: TELEMETRY_SIGNAL_DELAYED_THRESHOLD_MS - 60_000, expected: 'signal_delayed' as const },
      { label: '48h', ageMs: TELEMETRY_SIGNAL_DELAYED_THRESHOLD_MS, expected: 'offline' as const },
    ])('$label → $expected', ({ ageMs, expected }) => {
      const observed = new Date(NOW_MS - ageMs).toISOString();
      const result = resolveTelemetryFreshness(
        { providerObservedAt: observed },
        NOW_MS,
      );
      expect(result.freshness).toBe(expected);
    });

    it('no timestamp → no_signal', () => {
      expect(resolveTelemetryFreshness({}, NOW_MS).freshness).toBe('no_signal');
    });
  });

  describe('timestamp priority', () => {
    it('prefers providerObservedAt over receivedAt and lastSeen', () => {
      const observed = hoursAgo(30);
      const result = resolveTelemetryFreshness(
        {
          providerObservedAt: new Date(observed).toISOString(),
          receivedAt: new Date(NOW_MS).toISOString(),
          latestStateUpdatedAt: new Date(NOW_MS).toISOString(),
        },
        NOW_MS,
      );
      expect(result.freshness).toBe('signal_delayed');
    });

    it('delayed snapshot: old observed, fresh received does not rejuvenate', () => {
      const result = resolveTelemetryFreshness(
        {
          providerObservedAt: new Date(hoursAgo(30)).toISOString(),
          receivedAt: new Date(NOW_MS).toISOString(),
        },
        NOW_MS,
      );
      expect(result.freshness).toBe('signal_delayed');
    });

    it('backfill received now with stale lastSignal keeps stale freshness', () => {
      const result = resolveTelemetryFreshness(
        {
          receivedAt: new Date(NOW_MS).toISOString(),
          lastSignal: new Date(hoursAgo(36)).toISOString(),
        },
        NOW_MS,
      );
      expect(result.freshness).toBe('signal_delayed');
    });

    it('uses lastSignal when no provider observed', () => {
      const result = resolveTelemetryFreshness(
        {
          lastSignal: new Date(minutesAgo(5)).toISOString(),
        },
        NOW_MS,
      );
      expect(result.freshness).toBe('live');
    });
  });

  describe('legacy connection status mapping', () => {
    it('maps signal_delayed to signal_delayed legacy status', () => {
      expect(
        mapTelemetryFreshnessToLegacyConnectionStatus('signal_delayed', true),
      ).toBe('signal_delayed');
    });

    it('maps no_signal to offline when linked', () => {
      expect(
        mapTelemetryFreshnessToLegacyConnectionStatus('no_signal', true),
      ).toBe('offline');
    });
  });

  describe('resolveCanonicalTelemetryObservedAtMs', () => {
    it('ignores receivedAt when it exceeds backfill lag vs lastSignal', () => {
      const lastSignal = hoursAgo(36);
      const ms = resolveCanonicalTelemetryObservedAtMs({
        receivedAt: new Date(NOW_MS).toISOString(),
        lastSignal: new Date(lastSignal).toISOString(),
        maxBackfillLagMs: DEFAULT_TELEMETRY_BACKFILL_MAX_LAG_MS,
      });
      expect(ms).toBe(lastSignal);
    });
  });
});
