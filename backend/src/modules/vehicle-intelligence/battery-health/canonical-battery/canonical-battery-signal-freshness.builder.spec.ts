import { buildObservationFreshness } from '../battery-freshness.policy';
import { BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS } from '../battery-signal-freshness.contract';
import { buildCanonicalBatterySignalFreshness } from './canonical-battery-signal-freshness.builder';

describe('canonical-battery-signal-freshness.builder', () => {
  const now = new Date('2026-07-16T12:00:00.000Z');
  const receivedAt = new Date('2026-07-16T12:05:00.000Z');
  const staleObservedAt = new Date('2026-05-01T12:00:00.000Z');

  const baseInput = {
    now,
    receivedAt,
    lvValues: {
      voltageV: 12.4,
      voltageSource: 'live_telemetry' as const,
      temperatureC: 20,
      restingVoltageV: 12.3,
      crankingVoltageV: null,
      chargingVoltageV: null,
      engineRunning: false,
    },
    hvValues: {
      socPercent: 72,
      rangeKm: 280,
      currentEnergyKwh: 52,
      grossCapacityKwh: 76,
      addedEnergyKwh: 4,
      chargingPowerKw: 11,
      currentVoltageV: 360,
      temperatureC: 24,
      isCharging: true,
      chargingCableConnected: true,
      providerSohPercent: 88,
    },
    lvVoltageObservedAt: now,
    lvSnapshotObservedAt: now,
    hvAggregateObservedAt: staleObservedAt,
    providerSohObservedAt: staleObservedAt,
    restMeasurementObservedAt: now,
    startProxyObservedAt: null,
    assessmentObservedAt: now,
    publicationObservedAt: now,
    hvSessionObservedAt: now,
    lvObservationFreshness: buildObservationFreshness({
      observedAt: now,
      maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.lvLiveObservation,
      now,
      hasValueCarrier: true,
    }),
    lvRestMeasurementFreshness: buildObservationFreshness({
      observedAt: now,
      maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.restMeasurementObservation,
      now,
      hasValueCarrier: true,
    }),
    lvStartProxyFreshness: buildObservationFreshness({
      observedAt: null,
      maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.startProxyObservation,
      now,
      hasValueCarrier: false,
    }),
    lvAssessmentFreshness: buildObservationFreshness({
      observedAt: now,
      maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.assessmentObservation,
      now,
      hasValueCarrier: true,
    }),
    lvPublicationFreshness: buildObservationFreshness({
      observedAt: now,
      maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.publicationObservation,
      now,
      hasValueCarrier: true,
    }),
    providerSohObservationFreshness: buildObservationFreshness({
      observedAt: staleObservedAt,
      maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.providerSohObservation,
      now,
      hasValueCarrier: true,
    }),
    hvSessionObservationFreshness: buildObservationFreshness({
      observedAt: now,
      maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.hvSessionObservation,
      now,
      hasValueCarrier: true,
    }),
    isEv: true,
  };

  it('builds per-value freshness envelopes with observedAt, receivedAt, ageMs, providerDelayMs, source', () => {
    const result = buildCanonicalBatterySignalFreshness(baseInput);

    expect(result.live.lv.voltageV.freshnessState).toBe('FRESH');
    expect(result.live.lv.voltageV.receivedAt).toBe(receivedAt.toISOString());
    expect(result.live.lv.voltageV.providerDelayMs).toBe(5 * 60_000);
    expect(result.live.hv.socPercent.freshnessState).toBe('STALE');
    expect(result.lvSignals.voltageV.value).toBe(12.4);
    expect(result.lvSignals.voltageV.freshness.source).toBe('LIVE_TELEMETRY');
    expect(result.namedSlices.liveVoltageFreshness.freshnessState).toBe('FRESH');
    expect(result.namedSlices.providerSohFreshness?.freshnessState).toBe('STALE');
    expect(result.namedSlices.hvSessionFreshness?.freshnessState).toBe('FRESH');
  });

  it('keeps stale HV SOC value when fetch is fresh', () => {
    const result = buildCanonicalBatterySignalFreshness(baseInput);
    expect(result.hvSignals.socPercent.value).toBe(72);
    expect(result.hvSignals.socPercent.freshness.freshnessState).toBe('STALE');
    expect(result.hvSignals.socPercent.error?.code).toBe('STALE');
  });
});
