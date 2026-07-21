import { describe, expect, it } from 'vitest';
import type { VehicleHealthResponse } from '../../lib/api';
import type { VehicleData } from '../data/vehicles';
import {
  isBookingVehicleHardBlocked,
  resolveBookingVehiclePreflight,
  vehicleStationId,
} from './booking-vehicle-preflight';

function baseVehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: 'v1',
    license: 'KS-AB 1',
    model: 'BMW X5 2024',
    year: 2024,
    station: 'Kassel',
    stationId: 'st-1',
    homeStationId: 'st-1',
    fuelType: 'Petrol',
    status: 'Available',
    cleaningStatus: 'Clean',
    healthStatus: 'Good Health',
    online: true,
    lastSignal: new Date().toISOString(),
    badge: 0,
    odometer: 10000,
    fuel: 80,
    battery: 0,
    speed: 0,
    coolant: 90,
    brakes: 90,
    tires: 90,
    engineOil: 90,
    isElectric: false,
    hvBatteryCapacityKwh: null,
    leasingRate: '0',
    insuranceCost: '0',
    taxCost: '0',
    totalMonthlyCost: '0',
    onlineStatus: 'ONLINE',
    ...overrides,
  } as VehicleData;
}

function health(overrides: Partial<VehicleHealthResponse> = {}): VehicleHealthResponse {
  return {
    vehicle_id: 'v1',
    organization_id: 'org-1',
    overall_state: 'good',
    rental_blocked: false,
    blocking_reasons: [],
    modules: {} as VehicleHealthResponse['modules'],
    generated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('booking-vehicle-preflight', () => {
  it('blocks offline vehicles', () => {
    const v = baseVehicle({ onlineStatus: 'OFFLINE', lastSignal: '2020-01-01T00:00:00.000Z' });
    const result = resolveBookingVehiclePreflight(v, null, true, false);
    expect(result.isSelectable).toBe(false);
    expect(result.hardBlockReason).toBe('offline');
    expect(isBookingVehicleHardBlocked(v, null)).toBe(true);
  });

  it('blocks rental_blocked vehicles', () => {
    const v = baseVehicle();
    const h = health({ rental_blocked: true, blocking_reasons: ['TÜV überfällig'] });
    const result = resolveBookingVehiclePreflight(v, h, true, false);
    expect(result.isSelectable).toBe(false);
    expect(result.hardBlockReason).toBe('rental_blocked');
    expect(result.blockingReason).toContain('TÜV');
  });

  it('blocks vehicles with unverified rental gate', () => {
    const v = baseVehicle();
    const h = health({
      availability: 'partial',
      rental_blocked: null,
      overall_state: 'good',
    });
    const result = resolveBookingVehiclePreflight(v, h, true, false);
    expect(result.isSelectable).toBe(false);
    expect(result.hardBlockReason).toBe('rental_blocked');
    expect(result.blockingReason).toContain('nicht verifiziert');
  });

  it('allows warning health without rental_blocked', () => {
    const v = baseVehicle();
    const h = health({ overall_state: 'warning', rental_blocked: false });
    const result = resolveBookingVehiclePreflight(v, h, true, false);
    expect(result.isSelectable).toBe(true);
    expect(result.healthWarningOnly).toBe(true);
    expect(result.cautionReason).toBeTruthy();
  });

  it('flags no tariff as hard block while catalog loaded', () => {
    const v = baseVehicle();
    const result = resolveBookingVehiclePreflight(v, null, false, false);
    expect(result.isSelectable).toBe(false);
    expect(result.hardBlockReason).toBe('no_tariff');
    expect(result.blockingReason).toContain('Tarif');
    expect(isBookingVehicleHardBlocked(v, null)).toBe(false);
  });

  it('does not hard block tariff while catalog is still loading', () => {
    const v = baseVehicle();
    const result = resolveBookingVehiclePreflight(v, null, false, true);
    expect(result.isSelectable).toBe(true);
    expect(result.noTariff).toBe(false);
  });

  it('resolves station id from homeStationId', () => {
    expect(vehicleStationId(baseVehicle({ homeStationId: 'st-9', stationId: 'st-1' }))).toBe('st-9');
  });
});
