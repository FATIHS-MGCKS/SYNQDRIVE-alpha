import type { FleetStatus } from '../data/vehicles';
import type { FleetCommandTab } from './fleet-operator-panel';
import { resolveOperatorTabForVehicle, type FleetVehicleContext } from './fleet-operator-panel';
import {
  VEHICLE_OPERATIONAL_STATUS,
  normalizeVehicleOperationalStatusKey,
} from './vehicle-operational-state';

export type FleetOperatorTab = FleetStatus;

/** @deprecated Use resolveOperatorTabForVehicle with full vehicle context. */
export function fleetStatusToOperatorTab(status: string): FleetOperatorTab {
  const normalized = normalizeVehicleOperationalStatusKey(status);
  if (normalized === VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED) {
    return VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED;
  }
  if (normalized === VEHICLE_OPERATIONAL_STATUS.RESERVED) {
    return VEHICLE_OPERATIONAL_STATUS.RESERVED;
  }
  if (
    normalized === VEHICLE_OPERATIONAL_STATUS.MAINTENANCE ||
    normalized === VEHICLE_OPERATIONAL_STATUS.BLOCKED
  ) {
    return VEHICLE_OPERATIONAL_STATUS.MAINTENANCE;
  }
  if (normalized === VEHICLE_OPERATIONAL_STATUS.UNKNOWN) {
    return VEHICLE_OPERATIONAL_STATUS.UNKNOWN;
  }
  return VEHICLE_OPERATIONAL_STATUS.AVAILABLE;
}

export function fleetContextToCommandTab(ctx: FleetVehicleContext): FleetCommandTab {
  return resolveOperatorTabForVehicle(ctx);
}

export function formatFleetMapRefreshAgo(
  lastFetchedAt: number | null,
  nowMs: number = Date.now(),
): string {
  if (lastFetchedAt == null) return '—';
  const sec = Math.max(0, Math.floor((nowMs - lastFetchedAt) / 1000));
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}
