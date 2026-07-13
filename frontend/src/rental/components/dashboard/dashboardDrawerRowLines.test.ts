import { describe, expect, it } from 'vitest';
import type { VehicleData } from '../../data/vehicles';
import {
  formatDrawerBnrLabel,
  parseDrawerCustomerName,
  resolveDrawerVehiclePlateModel,
} from './dashboardDrawerRowLines';

function vehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: 'v1',
    license: 'KS MX 2024',
    make: 'Mercedes-Benz',
    model: 'C 63 AMG',
    year: 2018,
    station: 'Zentrale',
    stationId: 'st-1',
    fuelType: 'Petrol',
    status: 'Active Rented',
    cleaningStatus: 'Clean',
    healthStatus: 'Good Health',
    online: false,
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
    isFresh: false,
    onlineStatus: 'OFFLINE',
    leasingRate: '',
    insuranceCost: '',
    taxCost: '',
    totalMonthlyCost: '',
    ...overrides,
  };
}

describe('dashboardDrawerRowLines', () => {
  it('parses customer label from subtitle', () => {
    expect(parseDrawerCustomerName('Kunde: Kübra Serin')).toBe('Kübra Serin');
    expect(parseDrawerCustomerName('Customer: Jane Doe')).toBe('Jane Doe');
  });

  it('formats abbreviated booking ref', () => {
    expect(formatDrawerBnrLabel('BK-FAEF3A')).toBe('BNR: BK-FAEF3A');
  });

  it('resolves vehicle plate and model from fleet vehicle', () => {
    expect(resolveDrawerVehiclePlateModel({ vehicle: vehicle() })).toEqual({
      plate: 'KS MX 2024',
      model: 'Mercedes-Benz C 63 AMG 2018',
    });
  });

  it('falls back to meta vehicle line', () => {
    expect(resolveDrawerVehiclePlateModel({
      metaFallback: 'WOB L 7503 · VW Golf 2020',
    })).toEqual({
      plate: 'WOB L 7503',
      model: 'VW Golf 2020',
    });
  });
});
