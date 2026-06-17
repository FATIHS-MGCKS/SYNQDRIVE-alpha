import { describe, expect, it } from 'vitest';
import type { VehicleData } from '../data/vehicles';
import {
  attentionSortRank,
  buildFleetVehicleContexts,
  buildStationFilterOptions,
  computeCommandTabCounts,
  filterFleetBySearch,
  filterFleetByStation,
  isFleetAttentionVehicle,
  resolveOperatorTabForVehicle,
  vehicleMatchesCommandTab,
} from './fleet-operator-panel';
import { deriveFleetVisualState } from './fleetVisualState';
import {
  ALL_STATIONS_FILTER,
  NO_LOCATION_FILTER,
  NO_STATION_FILTER,
} from '../stores/useFleetMapStore';

function vehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: overrides.id ?? 'v1',
    license: overrides.license ?? 'KS-FS 123',
    make: 'VW',
    model: 'Touran 2024',
    year: 2024,
    station: 'Kassel',
    stationId: 'st-1',
    stationName: 'Kassel Station',
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
    isFresh: true,
    onlineStatus: 'ONLINE',
    leasingRate: '',
    insuranceCost: '',
    taxCost: '',
    totalMonthlyCost: '',
    ...overrides,
  };
}

describe('fleet-operator-panel', () => {
  it('filterFleetBySearch matches plate, customer, and station', () => {
    const contexts = buildFleetVehicleContexts(
      [
        vehicle({ license: 'KS-AB 1', stationName: 'Berlin' }),
        vehicle({
          id: 'v2',
          license: 'M-XY 9',
          status: 'Active Rented',
          activeCustomerName: 'Ali Yilmaz',
        }),
      ],
      () => null,
    );
    expect(filterFleetBySearch(contexts, 'ali').map((c) => c.vehicle.license)).toEqual([
      'M-XY 9',
    ]);
    expect(filterFleetBySearch(contexts, 'berlin')).toHaveLength(1);
    expect(filterFleetBySearch(contexts, 'KS-AB')).toHaveLength(1);
  });

  it('computeCommandTabCounts uses the same filtered base', () => {
    const contexts = buildFleetVehicleContexts(
      [
        vehicle({ status: 'Available' }),
        vehicle({ id: 'v2', status: 'Active Rented', activeBookingId: 'b1' }),
        vehicle({
          id: 'v3',
          status: 'Available',
          onlineStatus: 'OFFLINE',
          isFresh: false,
        }),
      ],
      () => null,
    );
    const counts = computeCommandTabCounts(contexts);
    expect(counts.Available).toBe(2);
    expect(counts.Active).toBe(1);
    expect(counts.Attention).toBeGreaterThanOrEqual(1);
    expect(counts.All).toBe(3);
  });

  it('Attention bucket includes blocked, offline, stale, and no-location vehicles', () => {
    const blocked = buildFleetVehicleContexts([vehicle()], () => ({
      rental_blocked: true,
      overall_state: 'critical',
      blocking_reasons: ['Brake warning'],
      modules: {},
    }))[0];
    expect(isFleetAttentionVehicle(blocked.visual, blocked.vehicle, blocked.health)).toBe(true);

    const offline = buildFleetVehicleContexts(
      [vehicle({ onlineStatus: 'OFFLINE', isFresh: false })],
      () => null,
    )[0];
    expect(isFleetAttentionVehicle(offline.visual, offline.vehicle)).toBe(true);

    const noLoc = buildFleetVehicleContexts(
      [vehicle({ lat: undefined, lng: undefined })],
      () => null,
    )[0];
    expect(isFleetAttentionVehicle(noLoc.visual, noLoc.vehicle)).toBe(true);
  });

  it('attentionSortRank prioritizes blocked before overdue and offline', () => {
    const blocked = deriveFleetVisualState(vehicle(), {
      rentalHealth: {
        rental_blocked: true,
        overall_state: 'critical',
        blocking_reasons: ['x'],
      },
    });
    const offline = deriveFleetVisualState(
      vehicle({ onlineStatus: 'OFFLINE', isFresh: false }),
    );
    expect(
      attentionSortRank(blocked, vehicle()) < attentionSortRank(offline, vehicle()),
    ).toBe(true);
  });

  it('filterFleetByStation supports no-station and no-location filters', () => {
    const rows = [
      vehicle({ id: 'a', stationId: 'st-1' }),
      vehicle({ id: 'b', stationId: null, stationName: '' }),
      vehicle({ id: 'c', lat: undefined, lng: undefined }),
    ];
    expect(filterFleetByStation(rows, NO_STATION_FILTER)).toHaveLength(1);
    expect(filterFleetByStation(rows, NO_LOCATION_FILTER)).toHaveLength(1);
    expect(filterFleetByStation(rows, ALL_STATIONS_FILTER)).toHaveLength(3);
  });

  it('buildStationFilterOptions uses stations API and vehicle stats', () => {
    const options = buildStationFilterOptions(
      [
        { id: 'st-1', name: 'Kassel', latitude: 1, longitude: 2, radiusMeters: 100 } as never,
        { id: 'st-2', name: 'Berlin', latitude: 1, longitude: 2, radiusMeters: 100 } as never,
      ],
      [
        vehicle({ stationId: 'st-1' }),
        vehicle({ id: 'v2', stationId: null }),
      ],
      () => null,
    );
    expect(options.find((o) => o.id === ALL_STATIONS_FILTER)?.total).toBe(2);
    expect(options.find((o) => o.id === 'st-1')?.total).toBe(1);
    expect(options.some((o) => o.id === NO_STATION_FILTER)).toBe(true);
  });

  it('resolveOperatorTabForVehicle maps attention vehicles to Attention tab', () => {
    const ctx = buildFleetVehicleContexts(
      [vehicle({ onlineStatus: 'OFFLINE', isFresh: false })],
      () => null,
    )[0];
    expect(resolveOperatorTabForVehicle(ctx)).toBe('Attention');
    expect(vehicleMatchesCommandTab(ctx, 'Offline')).toBe(true);
  });
});
