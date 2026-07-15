import { describe, expect, it } from 'vitest';
import type { VehicleData } from '../../../data/vehicles';
import type { PickupTileItem, ReturnTileItem } from '../../StatInlineDetail';
import {
  computeCommandTabCounts,
  type FleetCommandTab,
} from '../../../lib/fleet-command-filters';
import { buildFleetVehicleContexts } from '../../../lib/fleet-operator-panel';
import {
  selectIsCurrentlyAvailable,
  selectIsCurrentlyRented,
  selectIsInPickupReservationWindow,
  selectOperationalStatus,
  VEHICLE_OPERATIONAL_STATUS,
} from '../../../lib/vehicle-operational-state';
import {
  collectGroupVehicleIds,
  countFleetVehiclesBySelector,
  fleetSelectorMatchesRuntimeState,
  resolveFleetTabCountsFromRuntime,
  uniqueVehicleIds,
  verifyReadyToRentKpiDrawerConsistency,
  verifySlicePrimaryRowCounts,
  verifyTodaysOperationsKpiDrawerConsistency,
  verifyUnknownExcludedFromAvailable,
} from './runtimeSliceConsistency';
import { resolveReadyForRentingKpiCounts } from '../dashboardSliceAccess';
import { buildDashboardRuntimeModel } from './dashboardSliceBuilder';

const NOW = new Date('2026-06-24T10:00:00.000Z');

function vehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: overrides.id ?? 'v1',
    license: overrides.license ?? 'KS-FS 123',
    make: overrides.make ?? 'VW',
    model: overrides.model ?? 'Golf',
    year: overrides.year ?? 2024,
    station: overrides.station ?? 'Zentrale',
    stationId: overrides.stationId ?? 'st-1',
    fuelType: overrides.fuelType ?? 'Petrol',
    status: overrides.status ?? 'Available',
    cleaningStatus: overrides.cleaningStatus ?? 'Clean',
    healthStatus: overrides.healthStatus ?? 'Good Health',
    online: overrides.online ?? true,
    lastSignal: overrides.lastSignal ?? NOW.toISOString(),
    badge: overrides.badge ?? 0,
    odometer: overrides.odometer ?? 10000,
    fuel: overrides.fuel ?? 72,
    battery: overrides.battery ?? 100,
    speed: overrides.speed ?? 0,
    coolant: overrides.coolant ?? 90,
    brakes: overrides.brakes ?? 90,
    tires: overrides.tires ?? 90,
    engineOil: overrides.engineOil ?? 90,
    isElectric: overrides.isElectric ?? false,
    hvBatteryCapacityKwh: overrides.hvBatteryCapacityKwh ?? null,
    isFresh: overrides.isFresh ?? false,
    onlineStatus: overrides.onlineStatus ?? 'STANDBY',
    leasingRate: overrides.leasingRate ?? '',
    insuranceCost: overrides.insuranceCost ?? '',
    taxCost: overrides.taxCost ?? '',
    totalMonthlyCost: overrides.totalMonthlyCost ?? '',
    ...overrides,
  };
}

function buildRuntime(
  fleetVehicles: VehicleData[],
  extras?: {
    pickupItems?: PickupTileItem[];
    returnItems?: ReturnTileItem[];
  },
) {
  return buildDashboardRuntimeModel({
    locale: 'en',
    fleetVehicles,
    blockedVehicleIds: new Set(['blocked']),
    pickupItems: extras?.pickupItems,
    returnItems: extras?.returnItems,
    now: NOW,
  });
}

function tabCountsFromContexts(vehicles: VehicleData[]) {
  const contexts = buildFleetVehicleContexts(vehicles, () => null);
  return computeCommandTabCounts(contexts);
}

describe('runtimeSliceConsistency', () => {
  const fleet = [
    vehicle({ id: 'avail', license: 'AVAIL', status: 'Available' }),
    vehicle({
      id: 'reserved',
      license: 'RES',
      status: 'Reserved',
      operationalState: {
        status: VEHICLE_OPERATIONAL_STATUS.RESERVED,
        reason: null,
        source: null,
        effectiveFrom: null,
        effectiveUntil: null,
        derivedAt: NOW.toISOString(),
        dataQualityState: 'RELIABLE',
        dataQualityReasons: [],
        isReliable: true,
      },
      bookingContext: {
        activeBooking: null,
        reservedBooking: {
          bookingId: 'b-res',
          customerName: 'C',
          pickupAt: NOW.toISOString(),
          returnAt: null,
          pickupStationName: 'Zentrale',
          returnStationName: null,
          isOverdue: false,
        },
        nextBooking: null,
        futureBookingCount: 0,
      },
    }),
    vehicle({
      id: 'rented',
      license: 'RENT',
      status: 'Active Rented',
      operationalState: {
        status: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
        reason: null,
        source: null,
        effectiveFrom: null,
        effectiveUntil: null,
        derivedAt: NOW.toISOString(),
        dataQualityState: 'RELIABLE',
        dataQualityReasons: [],
        isReliable: true,
      },
      bookingContext: {
        activeBooking: {
          bookingId: 'b-act',
          customerName: 'C',
          pickupAt: NOW.toISOString(),
          returnAt: NOW.toISOString(),
          pickupStationName: null,
          returnStationName: 'Zentrale',
          isOverdue: false,
        },
        reservedBooking: null,
        nextBooking: null,
        futureBookingCount: 0,
      },
    }),
    vehicle({
      id: 'unknown',
      license: 'UNK',
      status: 'Unknown',
      operationalState: {
        status: VEHICLE_OPERATIONAL_STATUS.UNKNOWN,
        reason: 'conflict',
        source: 'test',
        effectiveFrom: null,
        effectiveUntil: null,
        derivedAt: NOW.toISOString(),
        dataQualityState: 'DEGRADED',
        dataQualityReasons: [],
        isReliable: false,
      },
    }),
    vehicle({
      id: 'future-only',
      license: 'FUT',
      status: 'Available',
      operationalState: {
        status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
        reason: null,
        source: null,
        effectiveFrom: null,
        effectiveUntil: null,
        derivedAt: NOW.toISOString(),
        dataQualityState: 'RELIABLE',
        dataQualityReasons: [],
        isReliable: true,
      },
      bookingContext: {
        activeBooking: null,
        reservedBooking: null,
        nextBooking: {
          bookingId: 'b-future',
          customerName: 'Future',
          pickupAt: new Date(NOW.getTime() + 14 * 24 * 60 * 60_000).toISOString(),
          returnAt: null,
          pickupStationName: null,
          returnStationName: null,
          isOverdue: false,
        },
        futureBookingCount: 1,
      },
    }),
  ];

  it('keeps KPI counts aligned with drawer group rows from the same slice', () => {
    const runtime = buildRuntime(fleet);
    for (const check of [
      ...verifyReadyToRentKpiDrawerConsistency(runtime),
      ...verifyTodaysOperationsKpiDrawerConsistency(runtime),
    ]) {
      expect(check.kpiCount).toBe(check.drawerCount);
    }

    const readySlice = runtime.slices['ready-to-rent'];
    const kpi = resolveReadyForRentingKpiCounts(readySlice);
    expect(collectGroupVehicleIds(readySlice, 'ready-now').length).toBe(kpi.readyCount);
    expect(collectGroupVehicleIds(readySlice, 'available-but-not-ready').length).toBe(kpi.notReadyCount);
  });

  it('matches Fleet Available tab to operationalStatus available via runtime', () => {
    const runtime = buildRuntime(fleet);
    const fromRuntime = resolveFleetTabCountsFromRuntime(runtime);
    const fromSelectors = countFleetVehiclesBySelector(fleet);
    const fromPanel = tabCountsFromContexts(fleet);

    expect(fromRuntime.Available).toBe(fromSelectors.Available);
    expect(fromRuntime.Available).toBe(fromPanel.Available);
    expect(fromRuntime.Available).toBe(
      runtime.vehicleStates.filter((state) => state.operationalStatus === 'available').length,
    );
  });

  it('counts Reserved only for pickup reservation window, not nextBooking alone', () => {
    const runtime = buildRuntime(fleet);
    const reservedRuntime = resolveFleetTabCountsFromRuntime(runtime).Reserved;
    expect(reservedRuntime).toBe(1);
    expect(selectIsInPickupReservationWindow(fleet.find((v) => v.id === 'future-only')!)).toBe(false);
    expect(selectIsInPickupReservationWindow(fleet.find((v) => v.id === 'reserved')!)).toBe(true);
  });

  it('counts Active Rented only for ACTIVE_RENTED operational status', () => {
    const runtime = buildRuntime(fleet);
    expect(resolveFleetTabCountsFromRuntime(runtime).Active).toBe(1);
    expect(collectGroupVehicleIds(runtime.slices['active-rented'], 'active-rented-now')).toEqual(['rented']);
    expect(
      runtime.vehicleStates.filter((state) => state.operationalStatus === 'active_rented').length,
    ).toBe(1);
  });

  it('uses the same canonical status for dashboard runtime and fleet selectors per vehicle', () => {
    const runtime = buildRuntime(fleet);
    for (const v of fleet) {
      const state = runtime.vehicleStates.find((s) => s.vehicleId === v.id);
      expect(state, v.id).toBeDefined();
      expect(fleetSelectorMatchesRuntimeState(v, state!)).toBe(true);
    }
  });

  it('never counts UNKNOWN as Available in fleet tabs or ready slice', () => {
    const runtime = buildRuntime(fleet);
    expect(verifyUnknownExcludedFromAvailable(runtime)).toBe(true);
    expect(selectIsCurrentlyAvailable(fleet.find((v) => v.id === 'unknown')!)).toBe(false);
    expect(resolveFleetTabCountsFromRuntime(runtime).Available).not.toBeGreaterThan(
      fleet.filter((v) => selectIsCurrentlyAvailable(v)).length,
    );
  });

  it('keeps slice primary row counts equal to slice.count', () => {
    const runtime = buildRuntime(fleet);
    expect(verifySlicePrimaryRowCounts(runtime)).toBe(true);
  });

  it('aligns blocked-maintenance and critical-alerts with runtime vehicle states', () => {
    const runtime = buildRuntime(
      [
        ...fleet,
        vehicle({ id: 'maint', status: 'Maintenance' }),
        vehicle({ id: 'blocked', license: 'BLOCK' }),
      ],
      {},
    );
    const blocked = runtime.slices['blocked-maintenance'];
    expect(blocked.count).toBe(blocked.rows.length);
    expect(uniqueVehicleIds(blocked.rows.map((r) => r.vehicleId))).toHaveLength(blocked.count ?? 0);

    const critical = runtime.slices['critical-alerts'];
    expect(critical.count).toBe(critical.rows.length);
  });
});