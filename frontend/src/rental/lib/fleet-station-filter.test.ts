import { describe, expect, it } from 'vitest';
import type { VehicleData } from '../data/vehicles';
import { ALL_STATIONS_FILTER } from '../stores/useFleetMapStore';
import {
  filterFleetVehiclesByStationFilter,
  vehicleMatchesStationFilter,
} from './fleet-station-filter';

function vehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: overrides.id ?? 'v1',
    license: 'KS-FS 123',
    make: 'VW',
    model: 'Touran',
    year: 2024,
    station: 'Kassel',
    stationId: 'home-1',
    homeStationId: 'home-1',
    currentStationId: null,
    fuelType: 'Petrol',
    status: 'Available',
    cleaningStatus: 'Clean',
    healthStatus: 'Good Health',
    online: true,
    lastSignal: '',
    badge: 0,
    odometer: 0,
    fuel: 0,
    battery: 0,
    speed: 0,
    coolant: 0,
    brakes: 0,
    tires: 0,
    engineOil: 0,
    isElectric: false,
    hvBatteryCapacityKwh: null,
    leasingRate: '',
    insuranceCost: '',
    taxCost: '',
    totalMonthlyCost: '',
    ...overrides,
  };
}

describe('fleet-station-filter', () => {
  it('matches home, current, and legacy station ids', () => {
    const atCurrent = vehicle({
      id: 'current',
      stationId: 'home-1',
      homeStationId: 'home-1',
      currentStationId: 'current-2',
    });
    expect(vehicleMatchesStationFilter(atCurrent, 'current-2')).toBe(true);
    expect(vehicleMatchesStationFilter(atCurrent, 'home-1')).toBe(true);
    expect(vehicleMatchesStationFilter(atCurrent, 'other')).toBe(false);
  });

  it('filterFleetVehiclesByStationFilter keeps all vehicles for all-stations', () => {
    const rows = [vehicle({ id: 'a' }), vehicle({ id: 'b', stationId: 'st-2', homeStationId: 'st-2' })];
    expect(filterFleetVehiclesByStationFilter(rows, ALL_STATIONS_FILTER)).toHaveLength(2);
    expect(filterFleetVehiclesByStationFilter(rows, 'st-2')).toHaveLength(1);
  });
});
