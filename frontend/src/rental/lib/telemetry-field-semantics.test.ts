import { describe, expect, it } from 'vitest';
import {
  clampPercent,
  floorOdometerKm,
  formatTelemetryAccuracyM,
  formatTelemetryHeadingDeg,
  formatTelemetryInteger,
  formatTelemetryPercent,
  formatTelemetryPercentValue,
  formatTelemetryRangeKm,
  formatTelemetrySpeedKmh,
  formatTelemetryTemperatureC,
  formatTelemetryVoltage,
  isLegacyCoercedZero,
  isTelemetryMissing,
  isTelemetryPresent,
  mapTelemetryDashboardResponseLegacyCoerced,
  mapTelemetryDashboardResponseToLiveSnapshot,
  mapTelemetryDashboardResponseToNullableSnapshot,
  parseTelemetryAccuracyM,
  parseTelemetryHeadingDeg,
  parseTelemetryNumber,
  parseTelemetryOdometerKm,
  parseTelemetryPercent,
  parseTelemetryRangeKm,
  parseTelemetrySpeedKmh,
  parseTelemetryTemperatureC,
  parseTelemetryVoltage,
  resolveEnergyPercentForDisplay,
  resolveTelemetryScalarForDisplay,
} from './telemetry-field-semantics';

describe('telemetry-field-semantics — missing vs zero', () => {
  it('parseTelemetryNumber preserves 0 and rejects missing/invalid', () => {
    expect(parseTelemetryNumber(0)).toBe(0);
    expect(parseTelemetryNumber(42.7)).toBe(42.7);
    expect(parseTelemetryNumber(null)).toBeNull();
    expect(parseTelemetryNumber(undefined)).toBeNull();
    expect(parseTelemetryNumber(Number.NaN)).toBeNull();
    expect(parseTelemetryNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(parseTelemetryNumber('12')).toBeNull();
  });

  it('isTelemetryMissing / isTelemetryPresent distinguish absent from zero', () => {
    expect(isTelemetryMissing(0)).toBe(false);
    expect(isTelemetryPresent(0)).toBe(true);
    expect(isTelemetryMissing(null)).toBe(true);
    expect(isTelemetryMissing(undefined)).toBe(true);
  });

  it('nullable snapshot mapper keeps missing fields null', () => {
    const snapshot = mapTelemetryDashboardResponseToNullableSnapshot({});
    expect(snapshot).toEqual({
      speedKmh: null,
      fuelPercent: null,
      evSocPercent: null,
      odometerKm: null,
      coolantTempC: null,
      lvBatteryVoltage: null,
      engineLoadPercent: null,
      rangeKm: null,
      tractionBatteryTemperatureC: null,
      latitude: null,
      longitude: null,
      headingDeg: null,
      accuracyM: null,
    });
  });

  it('nullable snapshot mapper preserves explicit zeros as measured values', () => {
    const snapshot = mapTelemetryDashboardResponseToNullableSnapshot({
      speed: 0,
      fuel: 0,
      battery: 0,
      odometer: 0,
      coolant: 0,
      lvBatteryVoltage: 0,
      engineLoad: 0,
      rangeKm: 0,
      tractionBatteryTemperatureC: 0,
      heading: 0,
      accuracyM: 0,
    });
    expect(snapshot.speedKmh).toBe(0);
    expect(snapshot.fuelPercent).toBe(0);
    expect(snapshot.evSocPercent).toBe(0);
    expect(snapshot.odometerKm).toBe(0);
    expect(snapshot.rangeKm).toBe(0);
    expect(snapshot.headingDeg).toBe(0);
    expect(snapshot.accuracyM).toBe(0);
  });

  it('legacy coerced mapper documents pre-Prompt-10 hook behavior for missing API fields', () => {
    const legacy = mapTelemetryDashboardResponseLegacyCoerced({});
    expect(legacy.speed).toBe(0);
    expect(legacy.fuel).toBe(0);
    expect(legacy.odometer).toBe(0);

    expect(isLegacyCoercedZero(legacy.speed, undefined)).toBe(true);
    expect(isLegacyCoercedZero(legacy.fuel, null)).toBe(true);
    expect(isLegacyCoercedZero(0, 0)).toBe(false);
  });

  it('live snapshot mapper is null-preserving end-to-end', () => {
    const live = mapTelemetryDashboardResponseToLiveSnapshot({ speed: 0, fuel: null });
    expect(live.speed).toBe(0);
    expect(live.fuel).toBeNull();
    expect(live.rangeKm).toBeNull();
  });
});

describe('telemetry-field-semantics — bounded parsers', () => {
  const cases: Array<{
    name: string;
    parser: (value: unknown) => number | null;
    valid: Array<[unknown, number]>;
    invalid: unknown[];
  }> = [
    {
      name: 'percent',
      parser: parseTelemetryPercent,
      valid: [
        [0, 0],
        [100, 100],
        [72.4, 72.4],
      ],
      invalid: [null, undefined, NaN, '50', -1, 101, Number.POSITIVE_INFINITY],
    },
    {
      name: 'speed',
      parser: parseTelemetrySpeedKmh,
      valid: [
        [0, 0],
        [120, 120],
        [500, 500],
      ],
      invalid: [null, undefined, NaN, -1, 501, '80'],
    },
    {
      name: 'odometer',
      parser: parseTelemetryOdometerKm,
      valid: [
        [0, 0],
        [12345.9, 12345.9],
      ],
      invalid: [null, undefined, NaN, -1, 10_000_000],
    },
    {
      name: 'voltage',
      parser: parseTelemetryVoltage,
      valid: [
        [0, 0],
        [12.4, 12.4],
        [20, 20],
      ],
      invalid: [null, undefined, NaN, -0.1, 20.1],
    },
    {
      name: 'temperature',
      parser: parseTelemetryTemperatureC,
      valid: [
        [0, 0],
        [-20, -20],
        [90, 90],
      ],
      invalid: [null, undefined, NaN, -51, 151],
    },
    {
      name: 'range',
      parser: parseTelemetryRangeKm,
      valid: [
        [0, 0],
        [312, 312],
      ],
      invalid: [null, undefined, NaN, -1, 2001],
    },
    {
      name: 'heading',
      parser: parseTelemetryHeadingDeg,
      valid: [
        [0, 0],
        [180, 180],
        [360, 0],
      ],
      invalid: [null, undefined, NaN, -1, 361],
    },
    {
      name: 'accuracy',
      parser: parseTelemetryAccuracyM,
      valid: [
        [0, 0],
        [12, 12],
      ],
      invalid: [null, undefined, NaN, -1, 10_001],
    },
  ];

  for (const { name, parser, valid, invalid } of cases) {
    it(`${name}: accepts valid values including zero`, () => {
      for (const [input, expected] of valid) {
        expect(parser(input)).toBe(expected);
      }
    });

    it(`${name}: rejects missing and invalid values`, () => {
      for (const input of invalid) {
        expect(parser(input)).toBeNull();
      }
    });
  }
});

describe('telemetry-field-semantics — formatting', () => {
  it('formatters render em dash for missing and literal zero for measured zero', () => {
    expect(formatTelemetryInteger(null)).toBe('—');
    expect(formatTelemetryInteger(0)).toBe('0');
    expect(formatTelemetryInteger(12345.9)).toBe('12.346');

    expect(formatTelemetryPercent(undefined)).toBe('—');
    expect(formatTelemetryPercent(0)).toBe('0 %');
    expect(formatTelemetryPercent(72.4)).toBe('72 %');
    expect(formatTelemetryPercentValue(0)).toBe('0');
    expect(formatTelemetryPercentValue(null)).toBe('—');

    expect(formatTelemetrySpeedKmh(null)).toBe('—');
    expect(formatTelemetrySpeedKmh(0)).toBe('0 km/h');

    expect(formatTelemetryVoltage(null)).toBe('—');
    expect(formatTelemetryVoltage(12.4)).toBe('12.4 V');

    expect(formatTelemetryTemperatureC(undefined)).toBe('—');
    expect(formatTelemetryTemperatureC(0)).toBe('0 °C');

    expect(formatTelemetryRangeKm(null)).toBe('—');
    expect(formatTelemetryRangeKm(0)).toBe('0 km');

    expect(formatTelemetryHeadingDeg(null)).toBe('—');
    expect(formatTelemetryHeadingDeg(45)).toBe('45°');

    expect(formatTelemetryAccuracyM(null)).toBe('—');
    expect(formatTelemetryAccuracyM(8)).toBe('±8 m');
  });

  it('resolveEnergyPercentForDisplay uses canonical nullable fuel vs evSoc', () => {
    expect(
      resolveEnergyPercentForDisplay({
        isElectric: false,
        fuelPercent: 55,
        evSocPercent: null,
      }),
    ).toBe(55);
    expect(
      resolveEnergyPercentForDisplay({
        isElectric: true,
        fuelPercent: 55,
        evSocPercent: 80,
      }),
    ).toBe(80);
    expect(
      resolveEnergyPercentForDisplay({
        isElectric: false,
        fuelPercent: null,
        evSocPercent: null,
      }),
    ).toBeNull();
    expect(
      resolveEnergyPercentForDisplay({
        isElectric: true,
        fuelPercent: null,
        evSocPercent: 0,
      }),
    ).toBe(0);
  });

  it('resolveTelemetryScalarForDisplay prefers live then canonical then legacy', () => {
    expect(resolveTelemetryScalarForDisplay(42, 10, 5)).toBe(42);
    expect(resolveTelemetryScalarForDisplay(null, 10, 5)).toBe(10);
    expect(resolveTelemetryScalarForDisplay(undefined, null, 0)).toBe(0);
    expect(resolveTelemetryScalarForDisplay(null, null, null)).toBeNull();
    expect(resolveTelemetryScalarForDisplay(0, null, 99)).toBe(0);
  });

  it('floorOdometerKm and clampPercent match backend fleet derivation', () => {
    expect(floorOdometerKm(12345.89)).toBe(12345);
    expect(clampPercent(42.1)).toBe(43);
    expect(clampPercent(142)).toBe(100);
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(0)).toBe(0);
  });
});
