/**
 * Frontend provenance regression contract (P0.1).
 */
import { describe, expect, it } from 'vitest';
import type { VehicleHealthResponse } from '../../lib/api';
import type { VehicleData } from '../data/vehicles';
import { resolveFleetVehicleDisplayState } from './fleetVehicleDisplay';
import { classifyTelemetryFreshness } from './telemetryFreshness';

function vehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: 'v-prov-1',
    license: 'B-PR 1',
    model: 'Golf',
    year: 2022,
    station: 'Berlin',
    fuelType: 'Petrol',
    status: 'available',
    cleaningStatus: 'Clean',
    healthStatus: 'Good Health',
    online: false,
    lastSignal: new Date('2026-07-01T00:00:00.000Z').toISOString(),
    badge: 0,
    odometer: 1000,
    fuel: 50,
    battery: 0,
    speed: 0,
    coolant: 0,
    lat: 52.5,
    lng: 13.4,
    signalAgeMs: 50 * 24 * 60 * 60 * 1000,
    onlineStatus: 'OFFLINE',
    ...overrides,
  };
}

describe('vehicle operational provenance regression (P0.1)', () => {
  describe('Test A — operational availability vs telemetry', () => {
    it('keeps Verfügbar operational badge while telemetry is offline', () => {
      const display = resolveFleetVehicleDisplayState(vehicle(), { locale: 'de' });
      expect(display.statusBadge.label).toBe('Verfügbar');
      expect(display.telemetryStatus).toBe('offline');
    });
  });

  describe('Test E — legacy health fallback containment', () => {
    it('uses canonical rental health overall_state instead of legacy GOOD when rental health exists', () => {
      const rentalHealth = {
        overall_state: 'unknown',
        modules: {},
      } as unknown as VehicleHealthResponse;
      const display = resolveFleetVehicleDisplayState(
        vehicle({ healthStatus: 'Good Health' }),
        { rentalHealth, locale: 'de' },
      );
      expect(display.healthDisplay.status).toBe('unknown');
      expect(display.healthDisplay.label).toBe('Unbekannt');
    });

    it('falls back to legacy healthStatus only when rental health is absent', () => {
      const display = resolveFleetVehicleDisplayState(
        vehicle({ healthStatus: 'Good Health' }),
        { locale: 'de' },
      );
      expect(display.healthDisplay.status).toBe('good');
    });
  });

  describe('telemetry freshness authority', () => {
    it('classifies 37-day-old signal as offline', () => {
      const freshness = classifyTelemetryFreshness(
        new Date(Date.now() - 37 * 24 * 60 * 60 * 1000),
      );
      expect(freshness).toBe('offline');
    });
  });
});
