import {
  hvTelemetryObservationIsDecisionFresh,
  presentHvBatteryStatusCompatResponse,
} from './battery-hv-battery-status.compat';

describe('battery-hv-battery-status.compat', () => {
  const staleObservation = {
    observedAt: '2026-01-01T10:00:00.000Z',
    observationAgeMs: 99_999_999,
    observationState: 'STALE' as const,
  };

  const freshObservation = {
    observedAt: '2026-04-13T10:00:00.000Z',
    observationAgeMs: 60_000,
    observationState: 'FRESH' as const,
  };

  it('does not bypass stale canonical SOC with legacy currentSocPercent=87', () => {
    const summary = {
      hv: {
        sohPct: 82,
        healthPercent: 82,
        method: 'provider',
        telemetry: { socPercent: null, rangeKm: 250 },
      },
      currentTelemetry: {
        socPercent: null,
        rangeKm: null,
        observationFreshness: staleObservation,
      },
    };
    const legacy = {
      currentSocPercent: 87,
      estimatedRangeKm: 310,
      sohPercent: 90,
      telemetry: { temperatureC: 22 },
    };

    const out = presentHvBatteryStatusCompatResponse(summary, legacy);
    expect(out.currentSocPercent).toBeNull();
    expect(out.estimatedRangeKm).toBeNull();
    expect(out.telemetry).toBeNull();
    expect(out.sohPercent).toBe(82);
    expect(out.legacy).toEqual(legacy);
  });

  it('returns fresh telemetry SOC and range when observation is decision-fresh', () => {
    const summary = {
      hv: {
        sohPct: 80,
        healthPercent: 80,
        method: 'provider',
        freshness: { observedAt: '2026-04-13T10:00:00.000Z' },
        telemetry: {
          socPercent: 66,
          rangeKm: 278,
          temperatureC: 24,
        },
      },
      currentTelemetry: {
        socPercent: 66,
        rangeKm: 278,
        observationFreshness: freshObservation,
      },
    };

    const out = presentHvBatteryStatusCompatResponse(summary, {
      currentSocPercent: 87,
      estimatedRangeKm: 999,
    });
    expect(out.currentSocPercent).toBe(66);
    expect(out.estimatedRangeKm).toBe(278);
    expect(out.telemetry?.temperatureC).toBe(24);
    expect(hvTelemetryObservationIsDecisionFresh(summary)).toBe(true);
  });

  it('does not present legacy SOH as validated when canonical SOH is unavailable', () => {
    const summary = {
      hv: {
        sohPct: null,
        healthPercent: null,
        method: 'estimate_unavailable',
        telemetry: { socPercent: 50, rangeKm: 100 },
      },
      currentTelemetry: {
        socPercent: 50,
        rangeKm: 100,
        observationFreshness: freshObservation,
      },
    };
    const out = presentHvBatteryStatusCompatResponse(summary, {
      sohPercent: 88,
      publishedSohPercent: 88,
    });
    expect(out.sohPercent).toBeNull();
    expect(out.publishedSohPercent).toBeNull();
  });
});
