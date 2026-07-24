import {
  classifyTelemetryFreshness,
  interpretVehicleState,
  type RawTelemetryInput,
} from './vehicle-state-interpreter';

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60_000);

const baseRaw = (overrides: Partial<RawTelemetryInput> = {}): RawTelemetryInput => ({
  lastSeenAt: minutesAgo(5),
  speedKmh: 0,
  isIgnitionOn: false,
  engineLoad: 0,
  coolantTempC: null,
  odometerKm: null,
  ...overrides,
});

describe('classifyTelemetryFreshness', () => {
  it('classifies the 5 telemetry states with 15min / 24h / 48h thresholds', () => {
    expect(classifyTelemetryFreshness(null)).toBe('no_signal');
    expect(classifyTelemetryFreshness(minutesAgo(5))).toBe('live');
    expect(classifyTelemetryFreshness(hoursAgo(2))).toBe('standby');
    expect(classifyTelemetryFreshness(hoursAgo(10))).toBe('standby');
    expect(classifyTelemetryFreshness(hoursAgo(30))).toBe('signal_delayed');
    expect(classifyTelemetryFreshness(hoursAgo(49))).toBe('offline');
  });
});

describe('interpretVehicleState — telemetryFreshness (additive)', () => {
  it('live signal => live + onlineStatus ONLINE (backward compatible)', () => {
    const s = interpretVehicleState(baseRaw({ lastSeenAt: minutesAgo(5) }), null);
    expect(s.telemetryFreshness).toBe('live');
    expect(s.onlineStatus).toBe('ONLINE');
    expect(s.isFresh).toBe(true);
  });

  it('2h quiet => standby telemetryFreshness, never offline', () => {
    const s = interpretVehicleState(baseRaw({ lastSeenAt: hoursAgo(2) }), null);
    expect(s.telemetryFreshness).toBe('standby');
    expect(s.onlineStatus).toBe('STANDBY');
    expect(s.isFresh).toBe(false);
  });

  it('30h quiet => signal_delayed (soft offline)', () => {
    const s = interpretVehicleState(baseRaw({ lastSeenAt: hoursAgo(30) }), null);
    expect(s.telemetryFreshness).toBe('signal_delayed');
  });

  it('49h quiet => offline', () => {
    const s = interpretVehicleState(baseRaw({ lastSeenAt: hoursAgo(49) }), null);
    expect(s.telemetryFreshness).toBe('offline');
    expect(s.onlineStatus).toBe('OFFLINE');
  });

  it('never reported => no_signal', () => {
    const s = interpretVehicleState(baseRaw({ lastSeenAt: null }), null);
    expect(s.telemetryFreshness).toBe('no_signal');
    expect(s.onlineStatus).toBe('OFFLINE');
  });
});

describe('interpretVehicleState — missing vs zero scalars', () => {
  it('preserves measured zero speed when signal is fresh', () => {
    const s = interpretVehicleState(baseRaw({ speedKmh: 0, lastSeenAt: minutesAgo(2) }), null);
    expect(s.displaySpeed).toBe(0);
    expect(s.displayState).toBe('PARKED');
  });

  it('nulls display scalars when signal is stale even if raw speed was 0', () => {
    const s = interpretVehicleState(
      baseRaw({ speedKmh: 0, coolantTempC: 0, engineLoad: 0, lastSeenAt: hoursAgo(49) }),
      null,
    );
    expect(s.displaySpeed).toBeNull();
    expect(s.displayCoolant).toBeNull();
    expect(s.displayEngineLoad).toBeNull();
  });

  it('keeps null coolant/engine load distinct from coerced-zero speed for IDLE logic', () => {
    const parked = interpretVehicleState(
      baseRaw({ speedKmh: 0, engineLoad: null, isIgnitionOn: false }),
      null,
    );
    const idle = interpretVehicleState(
      baseRaw({ speedKmh: 0, engineLoad: 12, isIgnitionOn: true }),
      null,
    );
    expect(parked.displayState).toBe('PARKED');
    expect(idle.displayState).toBe('IDLE');
    expect(idle.displayEngineLoad).toBe(12);
  });
});
