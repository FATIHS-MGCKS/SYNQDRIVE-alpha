import type { VehicleData } from '../data/vehicles';
import {
  selectNextBooking,
  selectOperationalStatus,
  selectIsCurrentlyAvailable,
  VEHICLE_OPERATIONAL_STATUS,
} from './vehicle-operational-state';

export type FleetTabFilterContext = {
  vehicle: VehicleData;
};

/** Canonical Fleet Command status tabs — mutually exclusive buckets (except All). */
export const FLEET_COMMAND_TABS = [
  'All',
  'Available',
  'Reserved',
  'Active',
  'Maintenance',
  'Unknown',
] as const;

export type FleetCommandTab = (typeof FLEET_COMMAND_TABS)[number];

export interface FleetCommandFilterState {
  tab: FleetCommandTab;
  /** Optional overlay — never replaces operational tab matching. */
  futureBookingOnly?: boolean;
}

const TAB_EMPTY_MESSAGES: Record<Exclude<FleetCommandTab, 'All'>, string> = {
  Available: 'No available vehicles in this filter',
  Active: 'No active rentals',
  Reserved: 'No reserved vehicles',
  Maintenance: 'No maintenance or blocked vehicles',
  Unknown: 'No vehicles with unknown status',
};

export function fleetCommandTabEmptyMessage(
  tab: FleetCommandTab,
  hasSearch: boolean,
  futureBookingOnly = false,
): string {
  if (hasSearch) return 'No vehicles match your search';
  if (futureBookingOnly) return 'No vehicles with a future booking in this filter';
  if (tab === 'All') return 'No vehicles in this filter';
  return TAB_EMPTY_MESSAGES[tab];
}

/** Future booking info — `bookingContext.nextBooking` only (not reserved window). */
export function selectHasFutureBooking(vehicle: VehicleData): boolean {
  return Boolean(selectNextBooking(vehicle)?.bookingId);
}

export function resolveFleetCommandTabForVehicle(
  vehicle: VehicleData,
): Exclude<FleetCommandTab, 'All'> {
  const status = selectOperationalStatus(vehicle);
  if (status === VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED) return 'Active';
  if (status === VEHICLE_OPERATIONAL_STATUS.RESERVED) return 'Reserved';
  if (
    status === VEHICLE_OPERATIONAL_STATUS.MAINTENANCE ||
    status === VEHICLE_OPERATIONAL_STATUS.BLOCKED
  ) {
    return 'Maintenance';
  }
  if (status === VEHICLE_OPERATIONAL_STATUS.UNKNOWN) return 'Unknown';
  if (selectIsCurrentlyAvailable(vehicle)) return 'Available';
  return 'Unknown';
}

export function resolveOperatorTabForVehicle(
  ctx: FleetTabFilterContext,
): Exclude<FleetCommandTab, 'All'> {
  return resolveFleetCommandTabForVehicle(ctx.vehicle);
}

export function vehicleMatchesFleetCommandTab(
  vehicle: VehicleData,
  tab: FleetCommandTab,
): boolean {
  if (tab === 'All') return true;
  return resolveFleetCommandTabForVehicle(vehicle) === tab;
}

export function filterFleetByTab<T extends FleetTabFilterContext>(
  contexts: T[],
  tab: FleetCommandTab,
): T[] {
  if (tab === 'All') return contexts;
  return contexts.filter((ctx) => vehicleMatchesFleetCommandTab(ctx.vehicle, tab));
}

export function applyFleetCommandFilters<T extends FleetTabFilterContext>(
  contexts: T[],
  filters: FleetCommandFilterState,
): T[] {
  let result = filterFleetByTab(contexts, filters.tab);
  if (filters.futureBookingOnly) {
    result = result.filter((ctx) => selectHasFutureBooking(ctx.vehicle));
  }
  return result;
}

export function computeCommandTabCounts<T extends FleetTabFilterContext>(
  contexts: T[],
  options: { futureBookingOnly?: boolean } = {},
): Record<FleetCommandTab, number> {
  const base = options.futureBookingOnly
    ? contexts.filter((ctx) => selectHasFutureBooking(ctx.vehicle))
    : contexts;

  const counts: Record<FleetCommandTab, number> = {
    All: base.length,
    Available: 0,
    Reserved: 0,
    Active: 0,
    Maintenance: 0,
    Unknown: 0,
  };

  for (const ctx of base) {
    const tab = resolveFleetCommandTabForVehicle(ctx.vehicle);
    counts[tab] += 1;
  }

  return counts;
}

export function fleetContextsToVehicles(contexts: FleetTabFilterContext[]): VehicleData[] {
  return contexts.map((ctx) => ctx.vehicle);
}
