import { resolveExp021FleetTelemetryFreshness } from './reference-capture-exp021-fleet-freshness-resolver.lib';

const DRIVE_NOW_MS = Date.parse('2026-09-16T12:10:00.000Z');
const LAST_SIGNAL = new Date('2026-09-15T20:56:14.000Z');
const LATEST_STATE = new Date('2026-09-16T12:05:15.000Z');

describe('resolveExp021FleetTelemetryFreshness', () => {
  it('A — lastSignal stale, latestState fresh → FRESH via latestState authority', () => {
    const result = resolveExp021FleetTelemetryFreshness(
      { dimoLastSignal: LAST_SIGNAL, latestStateLastSeenAt: LATEST_STATE, signalsLatestLastSeen: null },
      DRIVE_NOW_MS,
    );
    expect(result.telemetryFreshness).toBe('FRESH');
    expect(result.freshnessAuthority).toBe('LATEST_STATE_LAST_SEEN_AT');
    expect(result.freshnessTimestamp).toBe('2026-09-16T12:05:15.000Z');
    expect(result.freshnessAgeMs).toBe(285_000);
  });

  it('B — lastSignal fresh, latestState stale → FRESH via dimoLastSignal', () => {
    const freshSignal = new Date('2026-09-16T12:09:00.000Z');
    const staleLatest = new Date('2026-09-16T11:00:00.000Z');
    const result = resolveExp021FleetTelemetryFreshness(
      { dimoLastSignal: freshSignal, latestStateLastSeenAt: staleLatest, signalsLatestLastSeen: null },
      DRIVE_NOW_MS,
    );
    expect(result.telemetryFreshness).toBe('FRESH');
    expect(result.freshnessAuthority).toBe('DIMO_LAST_SIGNAL');
  });

  it('C — both stale → STALE', () => {
    const result = resolveExp021FleetTelemetryFreshness(
      {
        dimoLastSignal: new Date('2026-09-15T20:56:14.000Z'),
        latestStateLastSeenAt: new Date('2026-09-15T21:00:00.000Z'),
        signalsLatestLastSeen: null,
      },
      DRIVE_NOW_MS,
    );
    expect(result.telemetryFreshness).toBe('STALE');
  });

  it('D — both null → UNAVAILABLE', () => {
    const result = resolveExp021FleetTelemetryFreshness(
      { dimoLastSignal: null, latestStateLastSeenAt: null, signalsLatestLastSeen: null },
      DRIVE_NOW_MS,
    );
    expect(result.telemetryFreshness).toBe('UNAVAILABLE');
    expect(result.freshnessAuthority).toBeNull();
  });

  it('E — same timestamps → prefers latestState authority', () => {
    const ts = new Date('2026-09-16T12:05:15.000Z');
    const result = resolveExp021FleetTelemetryFreshness(
      { dimoLastSignal: ts, latestStateLastSeenAt: ts, signalsLatestLastSeen: null },
      DRIVE_NOW_MS,
    );
    expect(result.freshnessAuthority).toBe('LATEST_STATE_LAST_SEEN_AT');
  });

  it('F — invalid timestamp rejected', () => {
    const result = resolveExp021FleetTelemetryFreshness(
      {
        dimoLastSignal: new Date('invalid'),
        latestStateLastSeenAt: LATEST_STATE,
        signalsLatestLastSeen: null,
      },
      DRIVE_NOW_MS,
    );
    expect(result.telemetryFreshness).toBe('FRESH');
    expect(result.rejectedAuthorities.some((r) => r.authority === 'DIMO_LAST_SIGNAL')).toBe(true);
  });

  it('G — future timestamp beyond tolerated skew rejected', () => {
    const future = new Date(DRIVE_NOW_MS + 120_000);
    const result = resolveExp021FleetTelemetryFreshness(
      { dimoLastSignal: future, latestStateLastSeenAt: LATEST_STATE, signalsLatestLastSeen: null },
      DRIVE_NOW_MS,
    );
    expect(result.telemetryFreshness).toBe('FRESH');
    expect(result.freshnessAuthority).toBe('LATEST_STATE_LAST_SEEN_AT');
    expect(result.rejectedAuthorities).toContainEqual({
      authority: 'DIMO_LAST_SIGNAL',
      reason: 'FUTURE_BEYOND_SKEW',
    });
  });

  it('M — today real-drive fixture no longer falsely STALE', () => {
    const result = resolveExp021FleetTelemetryFreshness(
      {
        dimoLastSignal: LAST_SIGNAL,
        latestStateLastSeenAt: LATEST_STATE,
        signalsLatestLastSeen: LATEST_STATE,
      },
      DRIVE_NOW_MS,
    );
    expect(result.telemetryFreshness).toBe('FRESH');
    expect(result.freshnessAuthority).toBe('LATEST_STATE_LAST_SEEN_AT');
  });

  it('documents nullish-precedence bug reproduction', () => {
    const legacyWouldUse = LAST_SIGNAL;
    const ageMs = DRIVE_NOW_MS - legacyWouldUse.getTime();
    expect(ageMs).toBeGreaterThan(600_000);
    const fixed = resolveExp021FleetTelemetryFreshness(
      { dimoLastSignal: LAST_SIGNAL, latestStateLastSeenAt: LATEST_STATE, signalsLatestLastSeen: null },
      DRIVE_NOW_MS,
    );
    expect(fixed.telemetryFreshness).toBe('FRESH');
  });
});
