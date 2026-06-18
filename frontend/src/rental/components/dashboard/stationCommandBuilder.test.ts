import { describe, expect, it } from 'vitest';
import type { VehicleData } from '../../data/vehicles';
import {
  buildUnassignedFleetSummary,
  sortStationCommandSummaries,
} from './stationCommandBuilder';
import type { StationHealthSummary } from './dashboardTypes';

function station(partial: Partial<StationHealthSummary> & { stationId: string }): StationHealthSummary {
  return {
    stationName: partial.stationName ?? partial.stationId,
    vehicleCount: 0,
    availableCount: 0,
    rentedCount: 0,
    reservedCount: 0,
    maintenanceCount: 0,
    needsCleaningCount: 0,
    alertCount: 0,
    pickupsToday: 0,
    returnsToday: 0,
    overdueCount: 0,
    criticalAlerts: 0,
    blockedCount: 0,
    readyCount: 0,
    dueTodayCount: 0,
    capacityGap: 0,
    dataFreshness: 'live',
    statusSeverity: 'healthy',
    ...partial,
  };
}

function vehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: overrides.id ?? 'v1',
    license: 'KS-AB 1',
    model: 'Car',
    year: 2024,
    station: 'Kassel',
    fuelType: 'Petrol',
    status: 'Available',
    cleaningStatus: 'Clean',
    healthStatus: 'Good Health',
    online: true,
    lastSignal: new Date().toISOString(),
    badge: 0,
    odometer: 0,
    fuel: 50,
    battery: 100,
    speed: 0,
    coolant: 90,
    brakes: 90,
    tires: 90,
    engineOil: 90,
    isElectric: false,
    hvBatteryCapacityKwh: null,
    leasingRate: '',
    insuranceCost: '',
    taxCost: '',
    totalMonthlyCost: '',
    ...overrides,
  };
}

describe('stationCommandBuilder', () => {
  it('sorts critical stations before healthy ones', () => {
    const sorted = sortStationCommandSummaries([
      station({ stationId: 'a', stationName: 'Alpha', statusSeverity: 'healthy' }),
      station({ stationId: 'b', stationName: 'Beta', statusSeverity: 'critical', overdueCount: 2 }),
    ]);
    expect(sorted.map((s) => s.stationId)).toEqual(['b', 'a']);
  });

  it('detects unassigned fleet vehicles', () => {
    const summary = buildUnassignedFleetSummary([
      vehicle({ id: 'v1', stationId: null, homeStationId: null, currentStationId: null }),
      vehicle({ id: 'v2', stationId: 'st-1' }),
    ]);
    expect(summary.count).toBe(1);
    expect(summary.vehicles[0]?.vehicleId).toBe('v1');
  });
});
