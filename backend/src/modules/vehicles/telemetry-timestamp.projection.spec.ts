import {
  freshnessToOnlineStatus,
  projectTelemetryTimestampsFromLatestState,
  rehydrateFleetMapTelemetryFreshness,
} from './telemetry-timestamp.projection';

const NOW_MS = new Date('2026-07-18T12:00:00.000Z').getTime();

function hoursAgo(h: number): Date {
  return new Date(NOW_MS - h * 3_600_000);
}

describe('telemetry-timestamp.projection', () => {
  it('exposes measuredAt from sourceTimestamp and receivedAt from providerFetchedAt', () => {
    const measured = hoursAgo(2);
    const received = new Date(NOW_MS);
    const result = projectTelemetryTimestampsFromLatestState(
      {
        sourceTimestamp: measured,
        lastSeenAt: hoursAgo(3),
        providerFetchedAt: received,
      },
      NOW_MS,
    );

    expect(result.measuredAt).toBe(measured.toISOString());
    expect(result.receivedAt).toBe(received.toISOString());
    expect(result.observedAtIso).toBe(measured.toISOString());
    expect(result.isFresh).toBe(false);
    expect(result.telemetryFreshness).toBe('standby');
    expect(result.onlineStatus).toBe('STANDBY');
  });

  it('freshness uses provider measurement even when receipt is newer (delayed snapshot)', () => {
    const result = projectTelemetryTimestampsFromLatestState(
      {
        sourceTimestamp: hoursAgo(30),
        providerFetchedAt: new Date(NOW_MS),
      },
      NOW_MS,
    );

    expect(result.telemetryFreshness).toBe('signal_delayed');
    expect(result.isFresh).toBe(false);
    expect(result.signalAgeMs).toBeGreaterThan(24 * 60 * 60 * 1000);
  });

  it('missing provider time yields no_signal', () => {
    const result = projectTelemetryTimestampsFromLatestState(null, NOW_MS);
    expect(result.measuredAt).toBeNull();
    expect(result.receivedAt).toBeNull();
    expect(result.telemetryFreshness).toBe('no_signal');
    expect(result.lastSignal).toBe('');
  });

  it('measured zero age is live, not fabricated from receipt', () => {
    const measured = new Date(NOW_MS - 60_000);
    const result = projectTelemetryTimestampsFromLatestState(
      {
        sourceTimestamp: measured,
        providerFetchedAt: new Date(NOW_MS),
      },
      NOW_MS,
    );
    expect(result.isFresh).toBe(true);
    expect(result.telemetryFreshness).toBe('live');
  });

  it('rehydrateFleetMapTelemetryFreshness recomputes age on cache hit without changing measuredAt', () => {
    const measuredIso = hoursAgo(10).toISOString();
    const cachedAtIso = new Date(NOW_MS).toISOString();
    const row = rehydrateFleetMapTelemetryFreshness(
      {
        id: 'v1',
        measuredAt: measuredIso,
        receivedAt: new Date(NOW_MS).toISOString(),
        lastSeenAt: measuredIso,
        signalAgeMs: 0,
        isFresh: true,
        telemetryFreshness: 'live',
        onlineStatus: 'ONLINE',
        cachedAt: null,
      },
      NOW_MS,
      cachedAtIso,
    );

    expect(row.measuredAt).toBe(measuredIso);
    expect(row.cachedAt).toBe(cachedAtIso);
    expect(row.isFresh).toBe(false);
    expect(row.telemetryFreshness).toBe('standby');
    expect(row.signalAgeMs).toBeGreaterThan(9 * 60 * 60 * 1000);
  });

  it('freshnessToOnlineStatus maps canonical states', () => {
    expect(freshnessToOnlineStatus('live')).toBe('ONLINE');
    expect(freshnessToOnlineStatus('standby')).toBe('STANDBY');
    expect(freshnessToOnlineStatus('signal_delayed')).toBe('OFFLINE');
    expect(freshnessToOnlineStatus('no_signal')).toBe('OFFLINE');
  });
});
