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
  sortFleetContexts,
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
          lastSignal: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
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

  it('Attention bucket includes blocked, offline, soft-offline, and no-location vehicles', () => {
    const blocked = buildFleetVehicleContexts([vehicle()], () => ({
      rental_blocked: true,
      overall_state: 'critical',
      blocking_reasons: ['Brake warning'],
      modules: {},
    }))[0];
    expect(isFleetAttentionVehicle(blocked.visual, blocked.vehicle, blocked.health)).toBe(true);

    const offline = buildFleetVehicleContexts(
      [
        vehicle({
          onlineStatus: 'OFFLINE',
          isFresh: false,
          lastSignal: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
        }),
      ],
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
      vehicle({
        onlineStatus: 'OFFLINE',
        isFresh: false,
        lastSignal: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
      }),
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
      [
        vehicle({
          onlineStatus: 'OFFLINE',
          isFresh: false,
          lastSignal: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
        }),
      ],
      () => null,
    )[0];
    expect(resolveOperatorTabForVehicle(ctx)).toBe('Attention');
    expect(vehicleMatchesCommandTab(ctx, 'Offline')).toBe(true);
  });

  it('Offline tab counts only genuine offline devices (>=48h), not standby/soft-offline', () => {
    const hoursAgoIso = (h: number) =>
      new Date(Date.now() - h * 60 * 60_000).toISOString();
    // 2h-quiet device = standby, not stale, not offline.
    const standby = buildFleetVehicleContexts(
      [vehicle({ onlineStatus: 'STANDBY', isFresh: false, lastSignal: hoursAgoIso(2) })],
      () => null,
    )[0];
    // 30h = soft offline (signal_delayed) — still not in the Offline tab.
    const softOffline = buildFleetVehicleContexts(
      [vehicle({ id: 'soft', onlineStatus: 'OFFLINE', isFresh: false, lastSignal: hoursAgoIso(30) })],
      () => null,
    )[0];
    const offline = buildFleetVehicleContexts(
      [vehicle({ id: 'v2', onlineStatus: 'OFFLINE', isFresh: false, lastSignal: hoursAgoIso(49) })],
      () => null,
    )[0];
    expect(standby.visual.isStale).toBe(false);
    expect(softOffline.visual.isStale).toBe(true);
    expect(vehicleMatchesCommandTab(standby, 'Offline')).toBe(false);
    expect(vehicleMatchesCommandTab(softOffline, 'Offline')).toBe(false);
    expect(vehicleMatchesCommandTab(offline, 'Offline')).toBe(true);
  });

  it('Attention is not inflated by normal standby; soft-offline gets a low slot', () => {
    const hoursAgoIso = (h: number) =>
      new Date(Date.now() - h * 60 * 60_000).toISOString();
    const standby1h = buildFleetVehicleContexts(
      [vehicle({ onlineStatus: 'STANDBY', isFresh: false, lastSignal: hoursAgoIso(1) })],
      () => null,
    )[0];
    const standby8h = buildFleetVehicleContexts(
      [vehicle({ id: 'v2', onlineStatus: 'STANDBY', isFresh: false, lastSignal: hoursAgoIso(8) })],
      () => null,
    )[0];
    const softOffline = buildFleetVehicleContexts(
      [vehicle({ id: 'v3', onlineStatus: 'OFFLINE', isFresh: false, lastSignal: hoursAgoIso(30) })],
      () => null,
    )[0];
    expect(isFleetAttentionVehicle(standby1h.visual, standby1h.vehicle)).toBe(false);
    expect(isFleetAttentionVehicle(standby8h.visual, standby8h.vehicle)).toBe(false);
    expect(isFleetAttentionVehicle(softOffline.visual, softOffline.vehicle)).toBe(true);
  });

  it('sortFleetContexts keeps critical first and pushes offline to the bottom (All)', () => {
    const hoursAgoIso = (h: number) =>
      new Date(Date.now() - h * 60 * 60_000).toISOString();
    const contexts = buildFleetVehicleContexts(
      [
        vehicle({ id: 'ready', license: 'B-READY 1' }),
        vehicle({
          id: 'offline',
          license: 'A-OFF 1',
          onlineStatus: 'OFFLINE',
          isFresh: false,
          lastSignal: hoursAgoIso(49),
        }),
        vehicle({ id: 'crit', license: 'Z-CRIT 1' }),
      ],
      (id) =>
        id === 'crit'
          ? {
              rental_blocked: true,
              overall_state: 'critical',
              blocking_reasons: ['Brake critical'],
              modules: {},
            }
          : null,
    );
    const order = sortFleetContexts(contexts, 'All').map((c) => c.vehicle.id);
    expect(order[0]).toBe('crit');
    expect(order[order.length - 1]).toBe('offline');
  });
});
