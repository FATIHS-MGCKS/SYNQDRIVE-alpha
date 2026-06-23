import { describe, expect, it } from 'vitest';
import type { VehicleData } from '../data/vehicles';
import {
  fleetEnergyTone,
  fleetOperationalSortScore,
  isFleetSignalOutdated,
  resolveFleetVehicleDisplayState,
} from './fleetVehicleDisplay';

function vehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: overrides.id ?? 'v1',
    license: overrides.license ?? 'KS-FS 123',
    make: 'VW',
    model: 'Golf 2024',
    year: 2024,
    station: 'Zentrale',
    stationId: 'st-1',
    stationName: 'Zentrale',
    fuelType: 'Petrol',
    status: 'Available',
    cleaningStatus: 'Clean',
    healthStatus: 'Good Health',
    online: true,
    lastSignal: new Date().toISOString(),
    badge: 0,
    odometer: 10000,
    fuel: 72,
    battery: 100,
    speed: 0,
    coolant: 90,
    brakes: 90,
    tires: 90,
    engineOil: 90,
    isElectric: false,
    hvBatteryCapacityKwh: null,
    lat: 51.31,
    lng: 9.48,
    fuelPercent: 72,
    odometerKm: 1989,
    isFresh: true,
    onlineStatus: 'ONLINE',
    leasingRate: '',
    insuranceCost: '',
    taxCost: '',
    totalMonthlyCost: '',
    ...overrides,
  };
}

const hoursAgoIso = (h: number) => new Date(Date.now() - h * 60 * 60_000).toISOString();

describe('resolveFleetVehicleDisplayState', () => {
  it('STANDBY (a few hours) stays Ready and is shown calmly, no warning', () => {
    const d = resolveFleetVehicleDisplayState(
      vehicle({ onlineStatus: 'STANDBY', isFresh: false, lastSignal: hoursAgoIso(10) }),
      { locale: 'en' },
    );
    expect(d.primaryStatus).toBe('ready');
    expect(d.primaryLabel).toBe('Ready');
    expect(d.primaryLabel.toLowerCase()).not.toContain('stale');
    expect(d.telemetryStatus).toBe('standby');
    expect(d.showTelemetryWarning).toBe(false);
    expect(d.telemetryLabel.toLowerCase()).toContain('standby');
  });

  it('a 2h-quiet device is standby, never stale / warning', () => {
    const d = resolveFleetVehicleDisplayState(
      vehicle({ onlineStatus: 'STANDBY', isFresh: false, lastSignal: hoursAgoIso(2) }),
      { locale: 'en' },
    );
    expect(d.telemetryStatus).toBe('standby');
    expect(d.showTelemetryWarning).toBe(false);
  });

  it('signal delayed / soft offline (24–48h) shown calmly, primary stays ready', () => {
    const d = resolveFleetVehicleDisplayState(
      vehicle({ onlineStatus: 'STANDBY', isFresh: false, lastSignal: hoursAgoIso(30) }),
      { locale: 'en' },
    );
    expect(d.primaryStatus).toBe('ready');
    expect(d.telemetryStatus).toBe('signal_delayed');
    // Soft offline is not a hard warning — it is shown but does not warn.
    expect(d.showTelemetryWarning).toBe(false);
    expect(d.telemetryLabel.toLowerCase()).toContain('delayed');
  });

  it('maps offline telemetry (>=48h) to an offline label, primary stays ready', () => {
    const d = resolveFleetVehicleDisplayState(
      vehicle({ onlineStatus: 'OFFLINE', isFresh: false, lastSignal: hoursAgoIso(49) }),
      { locale: 'en' },
    );
    expect(d.primaryStatus).toBe('ready');
    expect(d.telemetryStatus).toBe('offline');
    expect(d.telemetryLabel.toLowerCase()).toContain('offline');
    expect(d.showTelemetryWarning).toBe(true);
  });

  it('no signal at all => no_signal, primary stays ready', () => {
    const d = resolveFleetVehicleDisplayState(
      vehicle({ onlineStatus: 'OFFLINE', isFresh: false, lastSignal: '', signalAgeMs: undefined }),
      { locale: 'en' },
    );
    expect(d.telemetryStatus).toBe('no_signal');
    expect(d.showTelemetryWarning).toBe(true);
  });

  it('builds an inline energy descriptor (icon + bar + percent), no "Fuel" word', () => {
    const fuelV = resolveFleetVehicleDisplayState(vehicle({ fuelPercent: 22 }), { locale: 'en' });
    expect(fuelV.energy.kind).toBe('fuel');
    expect(fuelV.energy.percent).toBe(22);
    expect(fuelV.energy.tone).toBe('red');

    const evV = resolveFleetVehicleDisplayState(
      vehicle({ isElectric: true, evSoc: 99, fuelPercent: null }),
      { locale: 'en' },
    );
    expect(evV.energy.kind).toBe('battery');
    expect(evV.energy.percent).toBe(99);
    expect(evV.energy.tone).toBe('green');
  });

  it('surfaces critical health as primaryStatus critical with a hint', () => {
    const d = resolveFleetVehicleDisplayState(vehicle(), {
      locale: 'en',
      rentalHealth: {
        rental_blocked: true,
        overall_state: 'critical',
        blocking_reasons: ['Battery critical — recharge/check'],
        modules: {},
      } as never,
    });
    expect(d.primaryStatus).toBe('critical');
    expect(d.criticalHint).toBeTruthy();
  });
});

describe('fleetEnergyTone', () => {
  it('classifies green / yellow / red / neutral', () => {
    expect(fleetEnergyTone(80)).toBe('green');
    expect(fleetEnergyTone(45)).toBe('yellow');
    expect(fleetEnergyTone(10)).toBe('red');
    expect(fleetEnergyTone(null)).toBe('neutral');
  });
});

describe('isFleetSignalOutdated', () => {
  it('is false for live/standby and true only from signal_delayed (>=24h)', () => {
    // standby (a few hours) is normal → not outdated
    expect(isFleetSignalOutdated({ lastSignal: hoursAgoIso(1), signalAgeMs: undefined })).toBe(false);
    expect(isFleetSignalOutdated({ lastSignal: hoursAgoIso(8), signalAgeMs: undefined })).toBe(false);
    // soft offline (24–48h) → outdated
    expect(isFleetSignalOutdated({ lastSignal: hoursAgoIso(30), signalAgeMs: undefined })).toBe(true);
    // offline (>=48h) → outdated
    expect(isFleetSignalOutdated({ lastSignal: hoursAgoIso(50), signalAgeMs: undefined })).toBe(true);
  });
});

describe('fleetOperationalSortScore', () => {
  it('keeps critical on top even when stale, pushes non-urgent offline to bottom', () => {
    const critStale = fleetOperationalSortScore(
      resolveFleetVehicleDisplayState(
        vehicle({ onlineStatus: 'STANDBY', isFresh: false, lastSignal: hoursAgoIso(10) }),
        {
          rentalHealth: {
            rental_blocked: true,
            overall_state: 'critical',
            blocking_reasons: ['x'],
            modules: {},
          } as never,
        },
      ),
    );
    const readyFresh = fleetOperationalSortScore(
      resolveFleetVehicleDisplayState(vehicle(), {}),
    );
    const readyOffline = fleetOperationalSortScore(
      resolveFleetVehicleDisplayState(
        vehicle({ onlineStatus: 'OFFLINE', isFresh: false, lastSignal: hoursAgoIso(48) }),
        {},
      ),
    );
    expect(critStale).toBeGreaterThan(readyFresh);
    expect(readyFresh).toBeGreaterThan(readyOffline);
  });
});
