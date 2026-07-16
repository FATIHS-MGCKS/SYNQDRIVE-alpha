import {
  BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS,
  buildBatterySignalFreshness,
  buildNamedFreshnessSlices,
  classifyBatteryModuleError,
  computeProviderDelayMs,
  observationFreshnessToSignalFreshness,
  resolveBatteryModuleSafe,
  sanitizeBatteryErrorMessage,
  signalFreshnessIsDecisionFresh,
  staleSignalError,
} from './battery-signal-freshness.contract';
import { buildObservationFreshness } from './battery-freshness.policy';

describe('battery-signal-freshness.contract', () => {
  const now = new Date('2026-07-16T12:00:00.000Z');
  const receivedAt = new Date('2026-07-16T12:05:00.000Z');

  it('builds full signal freshness envelope with providerDelayMs', () => {
    const observedAt = new Date('2026-07-16T11:58:00.000Z');
    const freshness = buildBatterySignalFreshness({
      observedAt,
      receivedAt,
      now,
      maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.lvLiveObservation,
      source: 'LIVE_TELEMETRY',
      hasValue: true,
    });

    expect(freshness.observedAt).toBe(observedAt.toISOString());
    expect(freshness.receivedAt).toBe(receivedAt.toISOString());
    expect(freshness.ageMs).toBe(now.getTime() - observedAt.getTime());
    expect(freshness.freshnessState).toBe('FRESH');
    expect(freshness.providerDelayMs).toBe(7 * 60_000);
    expect(freshness.source).toBe('LIVE_TELEMETRY');
    expect(signalFreshnessIsDecisionFresh(freshness)).toBe(true);
  });

  it('keeps stale observation when fetch is fresh', () => {
    const staleObservedAt = new Date('2026-05-01T12:00:00.000Z');
    const freshness = buildBatterySignalFreshness({
      observedAt: staleObservedAt,
      receivedAt: new Date('2026-07-16T11:59:00.000Z'),
      now,
      maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.providerSohObservation,
      source: 'DIMO_PROVIDER_SIGNAL',
      hasValue: true,
    });

    expect(freshness.freshnessState).toBe('STALE');
    expect(freshness.receivedAt).not.toBeNull();
    expect(signalFreshnessIsDecisionFresh(freshness)).toBe(false);
  });

  it('maps missing value carrier to NO_MEASUREMENT', () => {
    const freshness = buildBatterySignalFreshness({
      observedAt: null,
      receivedAt,
      now,
      maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.hvTelemetryObservation,
      source: 'DIMO_TELEMETRY',
      hasValue: false,
    });

    expect(freshness.freshnessState).toBe('NO_MEASUREMENT');
    expect(freshness.providerDelayMs).toBeNull();
  });

  it('converts observation freshness without losing receivedAt', () => {
    const observation = buildObservationFreshness({
      observedAt: new Date('2026-07-15T12:00:00.000Z'),
      maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.lvLiveObservation,
      now,
      hasValueCarrier: true,
    });
    const signal = observationFreshnessToSignalFreshness(observation, {
      receivedAt,
      source: 'RESTING_SNAPSHOT',
      hasValue: true,
    });

    expect(signal.freshnessState).toBe('FRESH');
    expect(signal.receivedAt).toBe(receivedAt.toISOString());
    expect(signal.source).toBe('RESTING_SNAPSHOT');
  });

  it('computes provider delay only for non-negative deltas', () => {
    expect(
      computeProviderDelayMs(
        new Date('2026-07-16T11:00:00.000Z'),
        new Date('2026-07-16T11:05:00.000Z'),
      ),
    ).toBe(5 * 60_000);
    expect(
      computeProviderDelayMs(
        new Date('2026-07-16T12:00:00.000Z'),
        new Date('2026-07-16T11:00:00.000Z'),
      ),
    ).toBeNull();
  });

  it('classifies module errors without leaking secrets or stack traces', () => {
    const timeout = classifyBatteryModuleError(
      'hvChargeSessions',
      new Error('DIMO query timeout after 30s'),
    );
    expect(timeout.code).toBe('QUERY_TIMEOUT');
    expect(timeout.module).toBe('hvChargeSessions');
    expect(timeout.labelDe).not.toMatch(/stack/i);

    const sanitized = sanitizeBatteryErrorMessage(
      'Authorization Bearer sk-live-abcdef token failure',
    );
    expect(sanitized).toBe('Interner Verarbeitungsfehler');
  });

  it('supports partial module resolution without throwing', async () => {
    const errors: ReturnType<typeof classifyBatteryModuleError>[] = [];
    const ok = await resolveBatteryModuleSafe({
      module: 'lvCanonical',
      errors,
      loader: async () => ({ ok: true }),
    });
    const failed = await resolveBatteryModuleSafe({
      module: 'hvSessions',
      errors,
      loader: async () => {
        throw new Error('provider unavailable');
      },
    });

    expect(ok).toEqual({ ok: true });
    expect(failed).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]?.code).toBe('PROVIDER_ERROR');
  });

  it('exposes all named freshness slices', () => {
    const live = buildBatterySignalFreshness({
      observedAt: now,
      receivedAt: now,
      now,
      maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.lvLiveObservation,
      source: 'LIVE_TELEMETRY',
      hasValue: true,
    });
    const slices = buildNamedFreshnessSlices({
      liveVoltageFreshness: live,
      restMeasurementFreshness: live,
      startProxyFreshness: null,
      assessmentFreshness: live,
      publicationFreshness: live,
      providerSohFreshness: live,
      hvSessionFreshness: live,
    });

    expect(slices.liveVoltageFreshness).toBe(live);
    expect(slices.startProxyFreshness).toBeNull();
    expect(staleSignalError('hv').code).toBe('STALE');
  });
});
