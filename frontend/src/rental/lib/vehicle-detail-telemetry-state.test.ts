import { describe, expect, it } from 'vitest';
import { buildBaselineVehicleData } from './vehicle-detail-baseline.fixtures';
import { resolveFleetVehicleDisplayState } from './fleetVehicleDisplay';
import {
  TELEMETRY_DELAYED_MAX_MS,
  TELEMETRY_LIVE_MAX_MS,
  TELEMETRY_STANDBY_MAX_MS,
  resolveTelemetryFreshness,
} from './telemetryFreshness';
import {
  mapTelemetryFreshnessToDisplayState,
  resolveVehicleDetailTelemetryState,
} from './vehicle-telemetry-runtime';

const NOW = new Date('2026-07-18T12:00:00.000Z').getTime();

function minutesAgo(m: number): string {
  return new Date(NOW - m * 60_000).toISOString();
}

function hoursAgo(h: number): string {
  return new Date(NOW - h * 3_600_000).toISOString();
}

describe('resolveVehicleDetailTelemetryState — canonical 5 states', () => {
  it('unknown: no usable measurement timestamp', () => {
    const state = resolveVehicleDetailTelemetryState({}, { now: NOW });
    expect(state.freshness).toBe('no_signal');
    expect(mapTelemetryFreshnessToDisplayState(state.freshness)).toBe('unknown');
    expect(state.shouldWarnUser).toBe(true);
  });

  it('live: signal within 15 min boundary', () => {
    const state = resolveVehicleDetailTelemetryState(
      { measuredAt: minutesAgo(5) },
      { now: NOW },
    );
    expect(state.freshness).toBe('live');
    expect(state.isLive).toBe(true);
  });

  it('live: exactly at live boundary (15 min − 1 ms)', () => {
    const measuredAt = new Date(NOW - (TELEMETRY_LIVE_MAX_MS - 1)).toISOString();
    const state = resolveVehicleDetailTelemetryState({ measuredAt }, { now: NOW });
    expect(state.freshness).toBe('live');
  });

  it('standby: just past live boundary', () => {
    const measuredAt = new Date(NOW - TELEMETRY_LIVE_MAX_MS).toISOString();
    const state = resolveVehicleDetailTelemetryState({ measuredAt }, { now: NOW });
    expect(state.freshness).toBe('standby');
    expect(mapTelemetryFreshnessToDisplayState(state.freshness)).toBe('standby');
  });

  it('standby: under 24 hours', () => {
    const state = resolveVehicleDetailTelemetryState(
      { measuredAt: hoursAgo(3) },
      { now: NOW },
    );
    expect(state.freshness).toBe('standby');
    expect(state.shouldWarnUser).toBe(false);
  });

  it('soft-offline: exactly 24 hours', () => {
    const measuredAt = new Date(NOW - TELEMETRY_STANDBY_MAX_MS).toISOString();
    const state = resolveVehicleDetailTelemetryState({ measuredAt }, { now: NOW });
    expect(state.freshness).toBe('signal_delayed');
    expect(mapTelemetryFreshnessToDisplayState(state.freshness)).toBe('soft_offline');
  });

  it('soft-offline: between 24h and 48h', () => {
    const state = resolveVehicleDetailTelemetryState(
      { measuredAt: hoursAgo(30) },
      { now: NOW },
    );
    expect(state.freshness).toBe('signal_delayed');
    expect(state.isSignalDelayed).toBe(true);
  });

  it('offline: exactly 48 hours', () => {
    const measuredAt = new Date(NOW - TELEMETRY_DELAYED_MAX_MS).toISOString();
    const state = resolveVehicleDetailTelemetryState({ measuredAt }, { now: NOW });
    expect(state.freshness).toBe('offline');
    expect(mapTelemetryFreshnessToDisplayState(state.freshness)).toBe('offline');
    expect(state.shouldWarnUser).toBe(true);
  });

  it('offline: older than 48 hours', () => {
    const state = resolveVehicleDetailTelemetryState(
      { measuredAt: hoursAgo(72) },
      { now: NOW },
    );
    expect(state.freshness).toBe('offline');
  });

  it('unknown: far-future timestamp is not treated as live', () => {
    const state = resolveVehicleDetailTelemetryState(
      { measuredAt: new Date(NOW + 2 * 3_600_000).toISOString() },
      { now: NOW },
    );
    expect(state.freshness).toBe('no_signal');
    expect(state.isLive).toBe(false);
  });

  it('unknown: invalid timestamp string', () => {
    const state = resolveVehicleDetailTelemetryState(
      { measuredAt: 'not-a-date', lastSignal: '' },
      { now: NOW },
    );
    expect(state.freshness).toBe('no_signal');
  });

  it('does not use receivedAt when measuredAt is stale (cache receipt ignored)', () => {
    const measuredAt = hoursAgo(30);
    const state = resolveVehicleDetailTelemetryState(
      {
        measuredAt,
        receivedAt: new Date(NOW).toISOString(),
      },
      { now: NOW },
    );
    expect(state.freshness).toBe('signal_delayed');
  });
});

describe('fleet and vehicle detail share canonical telemetry state', () => {
  const scenarios = [
    { label: 'live', lastSignal: minutesAgo(5), expected: 'live' as const },
    { label: 'standby', lastSignal: hoursAgo(3), expected: 'standby' as const },
    { label: 'soft-offline', lastSignal: hoursAgo(30), expected: 'signal_delayed' as const },
    { label: 'offline', lastSignal: hoursAgo(50), expected: 'offline' as const },
    { label: 'unknown', lastSignal: '', expected: 'no_signal' as const },
  ];

  it.each(scenarios)('$label: fleet display matches vehicle detail resolver', ({
    lastSignal,
    expected,
  }) => {
    const vehicle = buildBaselineVehicleData({
      lastSignal,
      measuredAt: lastSignal || null,
      signalAgeMs: lastSignal ? NOW - Date.parse(lastSignal) : undefined,
    });
    const fleet = resolveFleetVehicleDisplayState(vehicle, { now: NOW });
    const detail = resolveVehicleDetailTelemetryState(
      {
        measuredAt: vehicle.measuredAt,
        lastSignal: vehicle.lastSignal,
        signalAgeMs: vehicle.signalAgeMs,
        onlineStatus: vehicle.onlineStatus,
      },
      { now: NOW },
    );

    expect(fleet.telemetryStatus).toBe(expected);
    expect(detail.freshness).toBe(expected);
    expect(resolveTelemetryFreshness(vehicle, { now: NOW }).freshness).toBe(expected);
  });
});
