import {
  deriveRefuelFuelLevelRise,
  type FuelLevelSample,
} from './refuel-fuel-rise';
import {
  buildKsMx2024Aug28FuelSamples,
  KS_MX_2024_AUG28_DETECTION,
  KS_MX_2024_AUG28_FUEL_RISE,
} from '@modules/dimo/fixtures/ks-mx-2024-aug28-refuel.fixture';

function toSamples(
  raw: Array<{ timestamp: string; relativePercent?: number; absoluteLiters?: number }>,
): FuelLevelSample[] {
  return raw.map((s) => ({
    timestamp: new Date(s.timestamp),
    relativePercent: s.relativePercent ?? null,
    absoluteLiters: s.absoluteLiters ?? null,
  }));
}

describe('deriveRefuelFuelLevelRise', () => {
  it('derives KS MX 2024 Aug-28 fuel-rise interval (~280 s)', () => {
    const samples = toSamples(buildKsMx2024Aug28FuelSamples());
    const result = deriveRefuelFuelLevelRise(
      samples,
      new Date(KS_MX_2024_AUG28_DETECTION.startTime),
      new Date(KS_MX_2024_AUG28_DETECTION.endTime),
    );

    expect(result.derivationReason).toBe('derived');
    expect(result.fuelLevelRiseStart).not.toBeNull();
    expect(result.fuelLevelRiseEnd).not.toBeNull();
    expect(result.fuelLevelRiseDurationSeconds).not.toBeNull();
    expect(result.fuelLevelRiseDurationSeconds!).toBeGreaterThanOrEqual(240);
    expect(result.fuelLevelRiseDurationSeconds!).toBeLessThanOrEqual(320);

    const riseStartMs = result.fuelLevelRiseStart!.getTime();
    const riseEndMs = result.fuelLevelRiseEnd!.getTime();
    const expectedStart = new Date(KS_MX_2024_AUG28_FUEL_RISE.startTime).getTime();
    const expectedEnd = new Date(KS_MX_2024_AUG28_FUEL_RISE.endTime).getTime();
    expect(Math.abs(riseStartMs - expectedStart)).toBeLessThanOrEqual(60_000);
    expect(Math.abs(riseEndMs - expectedEnd)).toBeLessThanOrEqual(60_000);
  });

  it('returns null for short normal refuel with insufficient samples', () => {
    const result = deriveRefuelFuelLevelRise(
      toSamples([
        { timestamp: '2026-08-23T16:15:15.000Z', relativePercent: 13 },
        { timestamp: '2026-08-23T16:23:16.000Z', relativePercent: 42 },
      ]),
      new Date('2026-08-23T16:15:15.000Z'),
      new Date('2026-08-23T16:23:16.000Z'),
    );
    expect(result.fuelLevelRiseDurationSeconds).toBeNull();
    expect(result.derivationReason).toBe('insufficient_samples');
  });

  it('returns null when material rise is absent', () => {
    const flat: FuelLevelSample[] = [];
    const start = new Date('2026-08-28T10:00:00.000Z');
    for (let i = 0; i < 6; i++) {
      flat.push({
        timestamp: new Date(start.getTime() + i * 60_000),
        relativePercent: 50,
        absoluteLiters: null,
      });
    }
    const result = deriveRefuelFuelLevelRise(
      flat,
      start,
      new Date(start.getTime() + 5 * 60_000),
    );
    expect(result.fuelLevelRiseDurationSeconds).toBeNull();
    expect(result.derivationReason).toBe('no_material_rise');
  });

  it('tolerates a one-sample regression during rise', () => {
    const samples = toSamples([
      { timestamp: '2026-08-28T22:09:30.000Z', relativePercent: 6 },
      { timestamp: '2026-08-28T22:10:00.000Z', relativePercent: 8 },
      { timestamp: '2026-08-28T22:10:30.000Z', relativePercent: 7.2 },
      { timestamp: '2026-08-28T22:11:00.000Z', relativePercent: 15 },
      { timestamp: '2026-08-28T22:12:00.000Z', relativePercent: 28 },
      { timestamp: '2026-08-28T22:13:00.000Z', relativePercent: 36 },
      { timestamp: '2026-08-28T22:14:00.000Z', relativePercent: 39 },
      { timestamp: '2026-08-28T22:14:40.000Z', relativePercent: 40 },
    ]);
    const result = deriveRefuelFuelLevelRise(
      samples,
      new Date('2026-08-28T22:09:00.000Z'),
      new Date('2026-08-28T22:15:00.000Z'),
    );
    expect(result.derivationReason).toBe('derived');
    expect(result.fuelLevelRiseDurationSeconds).toBeGreaterThanOrEqual(180);
  });
});
