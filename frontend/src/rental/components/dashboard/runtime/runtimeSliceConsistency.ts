import type { FleetCommandTab } from '../../../lib/fleet-operator-panel';
import type { VehicleData } from '../../../data/vehicles';
import { mapCanonicalOperationalStatusToRuntime } from '../../../lib/fleet-map-vehicle-selectors';
import {
  selectIsCurrentlyAvailable,
  selectIsCurrentlyRented,
  selectIsInPickupReservationWindow,
  selectOperationalStatus,
  VEHICLE_OPERATIONAL_STATUS,
} from '../../../lib/vehicle-operational-state';
import {
  resolveReadyForRentingKpiCounts,
  resolveTodaysOperationsKpiCounts,
} from '../dashboardSliceAccess';
import type {
  DashboardRuntimeModel,
  DashboardSlice,
  DashboardSliceId,
  VehicleRuntimeState,
} from './dashboardRuntimeTypes';
import { TODAYS_OPERATIONAL_GROUP_IDS } from './todaysOperationalSlice';

/** Unique vehicle ids — canonical dedupe key across slices, KPIs, and drawers. */
export function uniqueVehicleIds(ids: Iterable<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

export function collectGroupVehicleIds(slice: DashboardSlice, groupId: string): string[] {
  const rows = slice.groups?.find((group) => group.id === groupId)?.rows ?? [];
  return uniqueVehicleIds(rows.map((row) => row.vehicleId));
}

export function collectSliceRowVehicleIds(slice: DashboardSlice): string[] {
  return uniqueVehicleIds(slice.rows.map((row) => row.vehicleId));
}

export function runtimeStateForVehicle(
  runtime: DashboardRuntimeModel,
  vehicleId: string,
): VehicleRuntimeState | undefined {
  return runtime.vehicleStates.find((state) => state.vehicleId === vehicleId);
}

/**
 * Fleet Command tab counts derived from the same runtime vehicle states as dashboard slices.
 * `operationalStatus` is already canonical via `vehicleRuntimeStateBuilder`.
 */
export function resolveFleetTabCountsFromRuntime(
  runtime: DashboardRuntimeModel,
  scopeVehicleIds?: ReadonlySet<string>,
): Record<FleetCommandTab, number> {
  const states = scopeVehicleIds
    ? runtime.vehicleStates.filter((state) => scopeVehicleIds.has(state.vehicleId))
    : runtime.vehicleStates;
  return {
    Available: states.filter((state) => state.operationalStatus === 'available').length,
    Active: states.filter((state) => state.operationalStatus === 'active_rented').length,
    Reserved: states.filter((state) => state.operationalStatus === 'reserved').length,
  };
}

export function countFleetVehiclesBySelector(
  vehicles: VehicleData[],
): Record<FleetCommandTab, number> {
  return {
    Available: vehicles.filter((vehicle) => selectIsCurrentlyAvailable(vehicle)).length,
    Active: vehicles.filter((vehicle) => selectIsCurrentlyRented(vehicle)).length,
    Reserved: vehicles.filter((vehicle) => selectIsInPickupReservationWindow(vehicle)).length,
  };
}

/** Dashboard runtime state must match canonical selector on the same fleet vehicle. */
export function fleetSelectorMatchesRuntimeState(
  vehicle: VehicleData,
  state: VehicleRuntimeState,
): boolean {
  const expected = mapCanonicalOperationalStatusToRuntime(selectOperationalStatus(vehicle));
  return state.operationalStatus === expected;
}

export interface SliceKpiDrawerCheck {
  sliceId: DashboardSliceId;
  groupId: string;
  kpiCount: number | null;
  drawerCount: number;
}

/** KPI footer/main counts must match drawer group rows from the same slice instance. */
export function verifyReadyToRentKpiDrawerConsistency(
  runtime: DashboardRuntimeModel,
): SliceKpiDrawerCheck[] {
  const slice = runtime.slices['ready-to-rent'];
  const kpi = resolveReadyForRentingKpiCounts(slice);
  return [
    {
      sliceId: 'ready-to-rent',
      groupId: 'ready-now',
      kpiCount: kpi.readyCount,
      drawerCount: collectGroupVehicleIds(slice, 'ready-now').length,
    },
    {
      sliceId: 'ready-to-rent',
      groupId: 'available-but-not-ready',
      kpiCount: kpi.notReadyCount,
      drawerCount: collectGroupVehicleIds(slice, 'available-but-not-ready').length,
    },
  ];
}

export function verifyTodaysOperationsKpiDrawerConsistency(
  runtime: DashboardRuntimeModel,
): SliceKpiDrawerCheck[] {
  const slice = runtime.slices['active-rented'];
  const kpi = resolveTodaysOperationsKpiCounts(slice);
  return [
    {
      sliceId: 'active-rented',
      groupId: TODAYS_OPERATIONAL_GROUP_IDS.ACTIVE_RENTED_NOW,
      kpiCount: kpi.activeRentalsCount,
      drawerCount: collectGroupVehicleIds(slice, TODAYS_OPERATIONAL_GROUP_IDS.ACTIVE_RENTED_NOW).length,
    },
    {
      sliceId: 'active-rented',
      groupId: TODAYS_OPERATIONAL_GROUP_IDS.PICKUPS_TODAY,
      kpiCount: kpi.pickupsToday,
      drawerCount: collectGroupVehicleIds(slice, TODAYS_OPERATIONAL_GROUP_IDS.PICKUPS_TODAY).length,
    },
    {
      sliceId: 'active-rented',
      groupId: TODAYS_OPERATIONAL_GROUP_IDS.RETURNS_TODAY,
      kpiCount: kpi.returnsToday,
      drawerCount: collectGroupVehicleIds(slice, TODAYS_OPERATIONAL_GROUP_IDS.RETURNS_TODAY).length,
    },
  ];
}

/** Slice `count` must equal primary `rows.length` for all operational slices. */
export function verifySlicePrimaryRowCounts(runtime: DashboardRuntimeModel): boolean {
  for (const slice of Object.values(runtime.slices)) {
    if (slice.count === null) continue;
    if (slice.count !== slice.rows.length) return false;
  }
  return true;
}

/** UNKNOWN must not appear in ready-to-rent primary rows. */
export function verifyUnknownExcludedFromAvailable(runtime: DashboardRuntimeModel): boolean {
  const readyIds = new Set(collectSliceRowVehicleIds(runtime.slices['ready-to-rent']));
  for (const state of runtime.vehicleStates) {
    if (state.operationalStatus === 'unknown' && readyIds.has(state.vehicleId)) {
      return false;
    }
  }
  return !runtime.vehicleStates.some(
    (state) => state.operationalStatus === 'unknown' && state.isReadyToRent,
  );
}

export function vehicleHasNextBookingOnlyNotReserved(vehicle: VehicleData): boolean {
  const ctx = vehicle.bookingContext;
  const hasNext = Boolean(ctx?.nextBooking?.bookingId ?? vehicle.reservedBookingId);
  const inWindow = selectIsInPickupReservationWindow(vehicle);
  return hasNext && !inWindow && selectOperationalStatus(vehicle) !== VEHICLE_OPERATIONAL_STATUS.RESERVED;
}
