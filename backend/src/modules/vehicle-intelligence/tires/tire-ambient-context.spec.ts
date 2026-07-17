import {
  buildAmbientTemperatureContext,
  computeTimeWeightedAmbientAverage,
  rejectSingleTemperatureSpike,
} from './tire-ambient-context';
import { evaluateTireDimoSignalCapability } from './tire-dimo-signal-capability';

const AS_OF = new Date('2026-07-16T12:00:00.000Z');

function usableAmbientCapability() {
  return evaluateTireDimoSignalCapability({
    signalName: 'exteriorAirTemperature',
    documentedInDimoSchema: true,
    listedInAvailableSignals: true,
    latestValueAvailable: true,
    historicalValuesAvailable: true,
    synqDriveUsesSignal: true,
    sampleCount14d: 40,
    coveragePercent: 25,
    lastSeenAt: new Date('2026-07-16T11:00:00.000Z'),
    asOf: AS_OF,
  });
}

describe('ambient temperature context', () => {
  it('computes multi-day time-weighted average', () => {
    const samples = [
      { timestamp: '2026-07-10T08:00:00.000Z', temperatureC: 10, weightKm: 20 },
      { timestamp: '2026-07-12T08:00:00.000Z', temperatureC: 12, weightKm: 30 },
      { timestamp: '2026-07-15T08:00:00.000Z', temperatureC: 14, weightKm: 25 },
    ];
    const agg = computeTimeWeightedAmbientAverage(samples, AS_OF, 7);
    expect(agg.sampleCount).toBe(3);
    expect(agg.weightedAvgTempC).not.toBeNull();
    expect(agg.weightedAvgTempC!).toBeGreaterThan(10);
    expect(agg.weightedAvgTempC!).toBeLessThan(15);
  });

  it('builds usable ambient context for capability-gated series', () => {
    const ctx = buildAmbientTemperatureContext({
      capability: usableAmbientCapability(),
      samples: [
        { timestamp: '2026-07-10T08:00:00.000Z', temperatureC: 2, weightKm: 40 },
        { timestamp: '2026-07-13T08:00:00.000Z', temperatureC: 3, weightKm: 35 },
        { timestamp: '2026-07-15T08:00:00.000Z', temperatureC: 1, weightKm: 30 },
      ],
      asOf: AS_OF,
    });
    expect(ctx.usable).toBe(true);
    expect(ctx.seasonBand).toBe('COLD');
    expect(ctx.pressureContextHintEn).toMatch(/Colder ambient/);
  });

  it('rejects single temperature spike', () => {
    const samples = [
      { timestamp: '2026-07-10T08:00:00.000Z', temperatureC: 10, weightKm: 50 },
      { timestamp: '2026-07-11T08:00:00.000Z', temperatureC: 11, weightKm: 50 },
      { timestamp: '2026-07-12T08:00:00.000Z', temperatureC: 45, weightKm: 2 },
    ];
    const filtered = rejectSingleTemperatureSpike(samples);
    expect(filtered.rejected).toBe(true);
    expect(filtered.samples).toHaveLength(2);
  });

  it('falls back when capability is unavailable', () => {
    const ctx = buildAmbientTemperatureContext({
      capability: evaluateTireDimoSignalCapability({
        signalName: 'exteriorAirTemperature',
        listedInAvailableSignals: false,
        asOf: AS_OF,
      }),
      samples: [
        { timestamp: '2026-07-10T08:00:00.000Z', temperatureC: 5, weightKm: 10 },
      ],
      asOf: AS_OF,
    });
    expect(ctx.usable).toBe(false);
    expect(ctx.weightedAvgTempC).toBeNull();
  });
});
