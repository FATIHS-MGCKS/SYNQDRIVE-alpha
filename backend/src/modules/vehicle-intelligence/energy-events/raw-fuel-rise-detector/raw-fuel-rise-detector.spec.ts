import { detectRawFuelRises } from './raw-fuel-rise-detector';
import { extractChannelSeries } from './raw-fuel-rise-normalizer';
import {
  buildDetectionContext,
  buildDetectorPhysicsContext,
  linearRiseSamples,
  sampleAt,
  stablePlateauSamples,
} from './testing/raw-fuel-rise-detector-test.util';

describe('raw-fuel-rise-detector positive paths', () => {
  it('A — trusted ABSOLUTE_ONLY refuel', () => {
    const context = buildDetectorPhysicsContext();
    const samples = [
      ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 7, 3, 300),
      ...linearRiseSamples('2026-09-06T08:16:00.000Z', [12, 18, 24, 29], 120),
      ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 29, 4, 120),
    ];
    const result = detectRawFuelRises({ context, samples });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].signalChannel).toBe('ABSOLUTE_LITERS');
    expect(result.candidates[0].lifecycleState).toBe('READY_FOR_PERSIST');
  });

  it('B — RELATIVE_ONLY refuel', () => {
    const context = buildDetectionContext({
      absoluteSignalTrust: 'UNKNOWN',
      relativeSignalAvailable: true,
    });
    const samples = [
      sampleAt('2026-09-06T08:00:00.000Z', null, 20),
      sampleAt('2026-09-06T08:05:00.000Z', null, 20),
      sampleAt('2026-09-06T08:10:00.000Z', null, 20),
      sampleAt('2026-09-06T08:16:00.000Z', null, 26),
      sampleAt('2026-09-06T08:18:00.000Z', null, 30),
      sampleAt('2026-09-06T08:20:00.000Z', null, 33),
      sampleAt('2026-09-06T08:22:00.000Z', null, 36),
      sampleAt('2026-09-06T08:24:00.000Z', null, 36),
      sampleAt('2026-09-06T08:26:00.000Z', null, 36),
      sampleAt('2026-09-06T08:28:00.000Z', null, 36),
    ];
    const result = detectRawFuelRises({ context, samples });
    expect(result.diagnostics.primaryChannel).toBe('RELATIVE_PERCENT');
    expect(result.candidates.length).toBeGreaterThanOrEqual(1);
  });

  it('C — absolute primary with relative corroboration only (single candidate)', () => {
    const context = buildDetectorPhysicsContext({ relativeSignalAvailable: true });
    const samples = [
      ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 7, 3, 300).map((s) => ({
        ...s,
        relativePercent: 20,
      })),
      sampleAt('2026-09-06T08:16:00.000Z', 12, 25),
      sampleAt('2026-09-06T08:18:00.000Z', 18, 30),
      sampleAt('2026-09-06T08:20:00.000Z', 24, 35),
      sampleAt('2026-09-06T08:22:00.000Z', 29, 38),
      sampleAt('2026-09-06T08:24:00.000Z', 29, 38),
      sampleAt('2026-09-06T08:26:00.000Z', 29, 38),
      sampleAt('2026-09-06T08:28:00.000Z', 29, 38),
    ];
    const result = detectRawFuelRises({ context, samples });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].signalChannel).toBe('ABSOLUTE_LITERS');
    expect(result.candidates[0].preFuelRelativePercent).toBe(20);
  });

  it('H — sparse but acceptable telemetry gap', () => {
    const context = buildDetectorPhysicsContext();
    const samples = [
      sampleAt('2026-09-06T08:00:00.000Z', 7),
      sampleAt('2026-09-06T08:05:00.000Z', 7),
      sampleAt('2026-09-06T08:10:00.000Z', 7),
      sampleAt('2026-09-06T08:16:00.000Z', 14),
      sampleAt('2026-09-06T08:22:00.000Z', 22),
      sampleAt('2026-09-06T08:28:00.000Z', 29),
      sampleAt('2026-09-06T08:34:00.000Z', 29),
      sampleAt('2026-09-06T08:40:00.000Z', 29),
    ];
    const result = detectRawFuelRises({ context, samples });
    expect(result.candidates.length).toBeGreaterThanOrEqual(1);
  });

  it('I — delayed post plateau', () => {
    const context = buildDetectorPhysicsContext();
    const samples = [
      ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
      sampleAt('2026-09-06T08:16:00.000Z', 16),
      sampleAt('2026-09-06T08:20:00.000Z', 22),
      sampleAt('2026-09-06T08:40:00.000Z', 30),
      sampleAt('2026-09-06T08:44:00.000Z', 30),
      sampleAt('2026-09-06T08:48:00.000Z', 30),
    ];
    const result = detectRawFuelRises({ context, samples });
    expect(result.candidates.length).toBeGreaterThanOrEqual(1);
  });

  it('J — quantized gauge rise', () => {
    const context = buildDetectorPhysicsContext();
    const samples = [
      ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 8, 3, 300),
      sampleAt('2026-09-06T08:16:00.000Z', 14),
      sampleAt('2026-09-06T08:18:00.000Z', 20),
      sampleAt('2026-09-06T08:20:00.000Z', 26),
      sampleAt('2026-09-06T08:22:00.000Z', 31),
      sampleAt('2026-09-06T08:24:00.000Z', 31),
      sampleAt('2026-09-06T08:26:00.000Z', 31),
      sampleAt('2026-09-06T08:28:00.000Z', 31),
    ];
    const result = detectRawFuelRises({ context, samples });
    expect(result.candidates.length).toBeGreaterThanOrEqual(1);
  });

  it('does not build mixed-unit numeric series', () => {
    const samples = [
      sampleAt('2026-09-06T08:00:00.000Z', 10, 20),
      sampleAt('2026-09-06T08:01:00.000Z', 12, null),
      sampleAt('2026-09-06T08:02:00.000Z', 20, 40),
    ];
    const normalized = [
      { timestamp: samples[0].timestamp, absoluteLiters: 10, relativePercent: 20 },
      { timestamp: samples[1].timestamp, absoluteLiters: 12, relativePercent: null },
      { timestamp: samples[2].timestamp, absoluteLiters: 20, relativePercent: 40 },
    ];
    const absoluteSeries = extractChannelSeries(normalized, 'ABSOLUTE_LITERS');
    const relativeSeries = extractChannelSeries(normalized, 'RELATIVE_PERCENT');
    expect(absoluteSeries.map((p) => p.value)).toEqual([10, 12, 20]);
    expect(relativeSeries.map((p) => p.value)).toEqual([20, 40]);
    expect(absoluteSeries.map((p) => p.value)).not.toEqual([20, 12, 40]);
  });
});
