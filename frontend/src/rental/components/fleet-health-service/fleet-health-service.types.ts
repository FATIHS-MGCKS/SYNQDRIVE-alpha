import type { ServiceCenterNavState } from '../../lib/service-center-navigation';
import type { ServiceCenterTab } from '../service-center/service-center.types';

/** Top-level Fleet hub tab (after V4.9.182 navigation merge). */
export type FleetTab = 'status' | 'condition-service';

/** @deprecated Legacy top-level tabs — normalized at routing boundaries. */
export type FleetTabLegacy = 'health' | 'service';

export type FleetTabInput = FleetTab | FleetTabLegacy;

/** Internal subtabs under „Zustand & Service“. */
export type FleetHealthServiceTab =
  | 'overview'
  | 'vehicles'
  | 'tasks'
  | 'schedule'
  | 'vendors'
  | 'history';

export const FLEET_HEALTH_SERVICE_TAB_ORDER: FleetHealthServiceTab[] = [
  'overview',
  'vehicles',
  'tasks',
  'schedule',
  'vendors',
  'history',
];

export function normalizeFleetTab(
  tab: FleetTabInput,
): { tab: FleetTab; subTab?: FleetHealthServiceTab } {
  if (tab === 'health') return { tab: 'condition-service', subTab: 'vehicles' };
  if (tab === 'service') return { tab: 'condition-service', subTab: 'overview' };
  return { tab };
}

export function serviceCenterTabToFleetSubTab(
  tab: ServiceCenterTab | undefined,
): FleetHealthServiceTab | undefined {
  if (!tab) return undefined;
  return tab;
}

export function fleetSubTabFromServiceCenterNav(
  nav: Partial<ServiceCenterNavState> | null | undefined,
): FleetHealthServiceTab {
  if (!nav) return 'overview';
  if (nav.focusTaskId) return 'tasks';
  if (nav.vendorId) return 'vendors';
  if (nav.tab) return serviceCenterTabToFleetSubTab(nav.tab) ?? 'overview';
  if (nav.vehicleId) return 'tasks';
  return 'overview';
}
