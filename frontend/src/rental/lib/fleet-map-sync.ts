import { normalizeFleetStatusKey } from './vehicle-status';
import type { FleetStatus } from '../data/vehicles';
import type { FleetCommandTab } from './fleet-operator-panel';
import { resolveOperatorTabForVehicle, type FleetVehicleContext } from './fleet-operator-panel';

export type FleetOperatorTab = FleetStatus;

/** @deprecated Use resolveOperatorTabForVehicle with full vehicle context. */
export function fleetStatusToOperatorTab(status: string): FleetOperatorTab {
  const normalized = normalizeFleetStatusKey(status);
  if (normalized === 'Blocked' || normalized === 'Unavailable') {
    return 'Maintenance';
  }
  return normalized as FleetOperatorTab;
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
