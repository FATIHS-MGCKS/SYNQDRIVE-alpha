import { describe, expect, it } from 'vitest';
import {
  clampPercent,
  floorOdometerKm,
  formatTelemetryInteger,
  formatTelemetryPercent,
  formatTelemetryRangeKm,
  formatTelemetrySpeedKmh,
  formatTelemetryTemperatureC,
  formatTelemetryVoltage,
  isLegacyCoercedZero,
  isTelemetryMissing,
  isTelemetryPresent,
  mapTelemetryDashboardResponseLegacyCoerced,
  mapTelemetryDashboardResponseToNullableSnapshot,
  parseTelemetryNumber,
  resolveEnergyPercentForDisplay,
} from './telemetry-field-semantics';

describe('telemetry-field-semantics — missing vs zero', () => {
  it('parseTelemetryNumber preserves 0 and rejects missing/invalid', () => {
    expect(parseTelemetryNumber(0)).toBe(0);
    expect(parseTelemetryNumber(42.7)).toBe(42.7);
    expect(parseTelemetryNumber(null)).toBeNull();
    expect(parseTelemetryNumber(undefined)).toBeNull();
    expect(parseTelemetryNumber(Number.NaN)).toBeNull();
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
    });
    expect(snapshot).toEqual({
      speedKmh: 0,
      fuelPercent: 0,
      evSocPercent: 0,
      odometerKm: 0,
      coolantTempC: 0,
      lvBatteryVoltage: 0,
      engineLoadPercent: 0,
    });
  });

  it('legacy coerced mapper documents current hook behavior for missing API fields', () => {
    const legacy = mapTelemetryDashboardResponseLegacyCoerced({});
    expect(legacy.speed).toBe(0);
    expect(legacy.fuel).toBe(0);
    expect(legacy.odometer).toBe(0);

    expect(isLegacyCoercedZero(legacy.speed, undefined)).toBe(true);
    expect(isLegacyCoercedZero(legacy.fuel, null)).toBe(true);
    expect(isLegacyCoercedZero(0, 0)).toBe(false);
  });

  it('legacy coercion detector flags false parked speed from missing signal', () => {
    const nullable = mapTelemetryDashboardResponseToNullableSnapshot({ speed: undefined });
    const legacy = mapTelemetryDashboardResponseLegacyCoerced({ speed: undefined });
    expect(nullable.speedKmh).toBeNull();
    expect(legacy.speed).toBe(0);
    expect(isLegacyCoercedZero(legacy.speed, nullable.speedKmh)).toBe(true);
  });
});

describe('telemetry-field-semantics — formatting', () => {
  it('formatters render em dash for missing and literal zero for measured zero', () => {
    expect(formatTelemetryInteger(null)).toBe('—');
    expect(formatTelemetryInteger(0)).toBe('0');
    expect(formatTelemetryInteger(12345.9)).toBe('12.346');

    expect(formatTelemetryPercent(undefined)).toBe('—');
    expect(formatTelemetryPercent(0)).toBe('0 %');
    expect(formatTelemetryPercent(72.4)).toBe('72 %');

    expect(formatTelemetrySpeedKmh(null)).toBe('—');
    expect(formatTelemetrySpeedKmh(0)).toBe('0 km/h');

    expect(formatTelemetryVoltage(null)).toBe('—');
    expect(formatTelemetryVoltage(12.4)).toBe('12.4 V');

    expect(formatTelemetryTemperatureC(undefined)).toBe('—');
    expect(formatTelemetryTemperatureC(0)).toBe('0 °C');

    expect(formatTelemetryRangeKm(null)).toBe('—');
    expect(formatTelemetryRangeKm(0)).toBe('0 km');
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

  it('floorOdometerKm and clampPercent match backend fleet derivation', () => {
    expect(floorOdometerKm(12345.89)).toBe(12345);
    expect(clampPercent(42.1)).toBe(43);
    expect(clampPercent(142)).toBe(100);
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(0)).toBe(0);
  });
});
