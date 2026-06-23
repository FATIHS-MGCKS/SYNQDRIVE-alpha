import { describe, expect, it } from 'vitest';
import type { VehicleData } from '../../data/vehicles';
import { buildFleetBoard } from './fleetStateBuilder';

const hoursAgoIso = (h: number) => new Date(Date.now() - h * 60 * 60_000).toISOString();

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

function buildItem(v: VehicleData) {
  const model = buildFleetBoard({
    locale: 'en',
    vehicles: [v],
    healthMap: new Map(),
    healthAlerts: [],
    filter: 'all',
  });
  return model.filteredItems[0];
}

describe('buildFleetBoard — telemetry freshness display', () => {
  it('standby (a few hours) is shown calmly, no warning', () => {
    const item = buildItem(
      vehicle({ onlineStatus: 'STANDBY', isFresh: false, lastSignal: hoursAgoIso(3) }),
    );
    expect(item.statusLabel.toLowerCase()).not.toContain('stale');
    expect(item.telemetryLabel?.toLowerCase()).toContain('standby');
    expect(item.showTelemetryWarning).toBe(false);
    expect(item.isOffline).toBe(false);
  });

  it('signal delayed (24–48h) is shown but not as a hard warning / not offline', () => {
    const item = buildItem(
      vehicle({ onlineStatus: 'OFFLINE', isFresh: false, lastSignal: hoursAgoIso(30) }),
    );
    expect(item.telemetryLabel?.toLowerCase()).toContain('delayed');
    expect(item.showTelemetryWarning).toBe(false);
    expect(item.isOffline).toBe(false);
  });

  it('offline (>=48h) warns and is flagged offline', () => {
    const item = buildItem(
      vehicle({ onlineStatus: 'OFFLINE', isFresh: false, lastSignal: hoursAgoIso(50) }),
    );
    expect(item.telemetryLabel?.toLowerCase()).toContain('offline');
    expect(item.showTelemetryWarning).toBe(true);
    expect(item.isOffline).toBe(true);
  });

  it('no signal => setup hint + warning', () => {
    const item = buildItem(
      vehicle({ onlineStatus: 'OFFLINE', isFresh: false, lastSignal: '', signalAgeMs: undefined }),
    );
    expect(item.telemetryLabel?.toLowerCase()).toContain('no signal');
    expect(item.telemetryLabel?.toLowerCase()).toContain('setup');
    expect(item.showTelemetryWarning).toBe(true);
  });

  it('no READY + STALE: an available standby vehicle keeps a clean Ready status', () => {
    const item = buildItem(
      vehicle({ onlineStatus: 'STANDBY', isFresh: false, lastSignal: hoursAgoIso(8) }),
    );
    expect(item.statusLabel.toLowerCase()).not.toContain('stale');
    expect(item.lane).toBe('ready');
  });
});
