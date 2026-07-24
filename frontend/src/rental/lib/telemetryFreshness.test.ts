import { describe, expect, it } from 'vitest';
import {
  classifyTelemetryFreshness,
  parseTelemetryTimestampMs,
  resolveCanonicalTelemetryObservedAtMs,
  resolveTelemetryFreshness,
  TELEMETRY_DELAYED_MAX_MS,
  TELEMETRY_LIVE_MAX_MS,
  TELEMETRY_STANDBY_MAX_MS,
} from './telemetryFreshness';

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60_000).toISOString();

describe('telemetry freshness thresholds', () => {
  it('uses the final product thresholds (15min / 24h / 48h)', () => {
    expect(TELEMETRY_LIVE_MAX_MS).toBe(15 * 60 * 1000);
    expect(TELEMETRY_STANDBY_MAX_MS).toBe(24 * 60 * 60 * 1000);
    expect(TELEMETRY_DELAYED_MAX_MS).toBe(48 * 60 * 60 * 1000);
  });

  it('classifyTelemetryFreshness boundaries', () => {
    expect(classifyTelemetryFreshness(null)).toBe('no_signal');
    expect(classifyTelemetryFreshness(0)).toBe('live');
    expect(classifyTelemetryFreshness(TELEMETRY_LIVE_MAX_MS - 1)).toBe('live');
    expect(classifyTelemetryFreshness(TELEMETRY_STANDBY_MAX_MS - 60_000)).toBe('standby');
    expect(classifyTelemetryFreshness(TELEMETRY_STANDBY_MAX_MS)).toBe('signal_delayed');
    expect(classifyTelemetryFreshness(TELEMETRY_DELAYED_MAX_MS - 60_000)).toBe('signal_delayed');
    expect(classifyTelemetryFreshness(TELEMETRY_DELAYED_MAX_MS)).toBe('offline');
    expect(classifyTelemetryFreshness(60 * 60 * 60_000)).toBe('offline');
  });
});

describe('resolveTelemetryFreshness', () => {
  it('1. lastSignal 5 minutes old => live, no warning', () => {
    const f = resolveTelemetryFreshness({ lastSignal: minutesAgo(5) });
    expect(f.freshness).toBe('live');
    expect(f.isLive).toBe(true);
    expect(f.shouldWarnUser).toBe(false);
  });

  it('2. lastSignal 2 hours old => standby, not stale, not offline, no warning', () => {
    const f = resolveTelemetryFreshness({ lastSignal: hoursAgo(2) });
    expect(f.freshness).toBe('standby');
    expect(f.isStandby).toBe(true);
    expect(f.isSignalDelayed).toBe(false);
    expect(f.isOffline).toBe(false);
    expect(f.shouldWarnUser).toBe(false);
  });

  it('3. lastSignal 10 hours old => standby, not stale, not offline, no warning', () => {
    const f = resolveTelemetryFreshness({ lastSignal: hoursAgo(10) });
    expect(f.freshness).toBe('standby');
    expect(f.isOffline).toBe(false);
    expect(f.shouldWarnUser).toBe(false);
  });

  it('4. lastSignal 30 hours old => signal_delayed (soft offline), not real offline', () => {
    const f = resolveTelemetryFreshness({ lastSignal: hoursAgo(30) });
    expect(f.freshness).toBe('signal_delayed');
    expect(f.isSignalDelayed).toBe(true);
    expect(f.isOffline).toBe(false);
    // Soft offline is shown calmly, not a hard warning.
    expect(f.shouldWarnUser).toBe(false);
  });

  it('5. lastSignal 49 hours old => offline, warning', () => {
    const f = resolveTelemetryFreshness({ lastSignal: hoursAgo(49) });
    expect(f.freshness).toBe('offline');
    expect(f.isOffline).toBe(true);
    expect(f.shouldWarnUser).toBe(true);
  });

  it('6. no lastSignal / no usable age => no_signal', () => {
    const f = resolveTelemetryFreshness({ lastSignal: '', signalAgeMs: undefined });
    expect(f.freshness).toBe('no_signal');
    expect(f.isNoSignal).toBe(true);
    expect(f.shouldWarnUser).toBe(true);
  });

  it('never-reported backend MAX_SAFE_INTEGER signalAgeMs => no_signal', () => {
    const f = resolveTelemetryFreshness({
      lastSignal: '',
      signalAgeMs: Number.MAX_SAFE_INTEGER,
      onlineStatus: 'OFFLINE',
    });
    expect(f.freshness).toBe('no_signal');
  });

  it('prefers the live lastSignal timestamp over a stale interpreted signalAgeMs', () => {
    const f = resolveTelemetryFreshness({ lastSignal: minutesAgo(3), signalAgeMs: 99 * 60 * 60_000 });
    expect(f.freshness).toBe('live');
  });

  it('delayed snapshot: stale observed with fresh received stays stale', () => {
    const f = resolveTelemetryFreshness({
      providerObservedAt: hoursAgo(30),
      receivedAt: new Date().toISOString(),
    });
    expect(f.freshness).toBe('signal_delayed');
  });

  it('localizes labels (de) for standby', () => {
    const f = resolveTelemetryFreshness({ lastSignal: hoursAgo(3) }, { locale: 'de' });
    expect(f.label.toLowerCase()).toContain('standby');
  });

  it('rejects invalid and empty timestamp strings', () => {
    expect(parseTelemetryTimestampMs('')).toBeNull();
    expect(parseTelemetryTimestampMs('invalid')).toBeNull();
    expect(resolveCanonicalTelemetryObservedAtMs({ lastSignal: 'invalid' })).toBeNull();
  });

  it('clamps future observed timestamps to age 0 at fixed now', () => {
    const now = Date.parse('2026-07-24T12:00:00.000Z');
    const future = new Date(now + 3_600_000).toISOString();
    const state = resolveTelemetryFreshness({ providerObservedAt: future }, { now });
    expect(state.signalAgeMs).toBe(0);
    expect(state.freshness).toBe('live');
  });
});
