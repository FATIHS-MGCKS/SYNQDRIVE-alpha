import { describe, expect, it } from 'vitest';
import {
  buildHandoverTelemetryPrefill,
  resolveVehicleFuelState,
  resolveVehicleOdometerKm,
} from './handoverVehicleTelemetry';

describe('handoverVehicleTelemetry', () => {
  const vehicle = {
    isElectric: false,
    odometerKm: 48_520,
    fuelPercent: 55,
  };

  it('resolves live odometer from canonical fleet fields', () => {
    expect(resolveVehicleOdometerKm(vehicle)).toBe(48_520);
    expect(resolveVehicleOdometerKm({ odometer: 12_000 })).toBe(12_000);
  });

  it('prefills pickup odometer and fuel from telemetry', () => {
    const prefill = buildHandoverTelemetryPrefill({ kind: 'PICKUP', vehicle });
    expect(prefill).toEqual({
      odometerKm: '48520',
      fuelPercent: 55,
      fuelFull: false,
      odometerFromTelemetry: true,
      fuelFromTelemetry: true,
    });
  });

  it('uses max of pickup and live odometer on return', () => {
    const prefill = buildHandoverTelemetryPrefill({
      kind: 'RETURN',
      vehicle,
      pickupOdometerKm: 48_000,
    });
    expect(prefill.odometerKm).toBe('48520');
    expect(prefill.odometerFromTelemetry).toBe(true);
  });

  it('falls back to pickup odometer when live telemetry is missing on return', () => {
    const prefill = buildHandoverTelemetryPrefill({
      kind: 'RETURN',
      vehicle: null,
      pickupOdometerKm: 48_000,
    });
    expect(prefill.odometerKm).toBe('48000');
    expect(prefill.odometerFromTelemetry).toBe(false);
  });

  it('uses evSoc for electric vehicles', () => {
    const fuel = resolveVehicleFuelState({ isElectric: true, evSoc: 72 });
    expect(fuel).toEqual({ fuelPercent: 72, fuelFull: false, fromTelemetry: true });
  });
});
