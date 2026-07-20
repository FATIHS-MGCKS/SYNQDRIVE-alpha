import type { ServiceCenterNavState } from '../../lib/service-center-navigation';
import type { OperatorStatusFilter } from '../../lib/fleet-health-control-center';
import type { ServiceCenterTab, ServiceTaskFilter } from '../service-center/service-center.types';

/** Top-level Fleet hub tab (after V4.9.182 navigation merge). */
export type FleetTab = 'status' | 'condition-service' | 'connectivity';

const FLEET_TABS: readonly FleetTab[] = ['status', 'condition-service', 'connectivity'];

/** @deprecated Legacy top-level tabs — normalized at routing boundaries. */
export type FleetTabLegacy = 'health' | 'service';

export type FleetTabInput = FleetTab | FleetTabLegacy;

/**
 * Primary navigation under „Zustand & Service“ (P52 — four areas).
 * Legacy six-tab keys are normalized via {@link normalizeFleetHealthServiceTab}.
 */
export type FleetHealthServiceTab = 'overview' | 'vehicles' | 'work' | 'history';

/** Sections inside **Arbeiten**. */
export type FleetHealthServiceWorkSection = 'tasks' | 'schedule' | 'vendors';

/** @deprecated Pre-P52 subtabs — mapped to {@link FleetHealthServiceTab} + {@link FleetHealthServiceWorkSection}. */
export type FleetHealthServiceTabLegacy = 'tasks' | 'schedule' | 'vendors';

export type FleetHealthServiceTabInput =
  | FleetHealthServiceTab
  | FleetHealthServiceTabLegacy;

export interface FleetHealthServiceNavState {
  tab: FleetHealthServiceTab;
  workSection: FleetHealthServiceWorkSection;
  /** Optional vehicle status filter when navigating from KPI → Fahrzeuge. */
  vehicleStatusFilter?: OperatorStatusFilter;
  /** Optional task filter when navigating from KPI → Arbeiten. */
  taskFilter?: ServiceTaskFilter;
}

export const FLEET_HEALTH_SERVICE_TAB_ORDER: FleetHealthServiceTab[] = [
  'overview',
  'vehicles',
  'work',
  'history',
];

export const FLEET_HEALTH_SERVICE_WORK_SECTION_ORDER: FleetHealthServiceWorkSection[] = [
  'tasks',
  'schedule',
];

export const DEFAULT_FLEET_HEALTH_SERVICE_NAV: FleetHealthServiceNavState = {
  tab: 'overview',
  workSection: 'tasks',
};

/**
 * Stable analytics / telemetry keys — legacy tab ids map to these without breaking dashboards.
 */
export const FLEET_HEALTH_SERVICE_NAV_ANALYTICS_KEYS: Record<
  FleetHealthServiceTabInput | 'history',
  string
> = {
  overview: 'fleet_health_service.overview',
  vehicles: 'fleet_health_service.vehicles',
  work: 'fleet_health_service.work',
  history: 'fleet_health_service.history',
  tasks: 'fleet_health_service.work.tasks',
  schedule: 'fleet_health_service.work.schedule',
  vendors: 'fleet_health_service.work.vendors',
};

export function fleetHealthServiceNavAnalyticsKey(
  nav: FleetHealthServiceNavState,
): string {
  if (nav.tab === 'work') {
    return FLEET_HEALTH_SERVICE_NAV_ANALYTICS_KEYS[nav.workSection];
  }
  return FLEET_HEALTH_SERVICE_NAV_ANALYTICS_KEYS[nav.tab];
}

export function normalizeFleetTab(
  tab: FleetTabInput | string,
): { tab: FleetTab; subTab?: FleetHealthServiceTabInput } {
  if (tab === 'health') return { tab: 'condition-service', subTab: 'vehicles' };
  if (tab === 'service') return { tab: 'condition-service', subTab: 'overview' };
  if (FLEET_TABS.includes(tab as FleetTab)) return { tab: tab as FleetTab };
  return { tab: 'status' };
}

export function normalizeFleetHealthServiceTab(
  input: FleetHealthServiceTabInput | string,
  workSectionHint?: FleetHealthServiceWorkSection | string,
): FleetHealthServiceNavState {
  switch (input) {
    case 'overview':
    case 'vehicles':
    case 'work':
    case 'history':
      return {
        tab: input,
        workSection: normalizeWorkSection(workSectionHint),
      };
    case 'tasks':
      return { tab: 'work', workSection: 'tasks' };
    case 'schedule':
      return { tab: 'work', workSection: 'schedule' };
    case 'vendors':
      return { tab: 'work', workSection: 'vendors' };
    default:
      return { ...DEFAULT_FLEET_HEALTH_SERVICE_NAV };
  }
}

function normalizeWorkSection(
  value: FleetHealthServiceWorkSection | string | undefined,
): FleetHealthServiceWorkSection {
  if (value === 'tasks' || value === 'schedule' || value === 'vendors') return value;
  return 'tasks';
}

export function normalizeFleetHealthServiceNavState(
  input: Partial<FleetHealthServiceNavState> | FleetHealthServiceTabInput | string | null | undefined,
): FleetHealthServiceNavState {
  if (!input) return { ...DEFAULT_FLEET_HEALTH_SERVICE_NAV };
  if (typeof input === 'string') return normalizeFleetHealthServiceTab(input);
  if ('tab' in input && input.tab) {
    return normalizeFleetHealthServiceTab(input.tab, input.workSection);
  }
  return { ...DEFAULT_FLEET_HEALTH_SERVICE_NAV };
}

export function serviceCenterTabToFleetSubTab(
  tab: ServiceCenterTab | undefined,
): FleetHealthServiceTabInput | undefined {
  if (!tab) return undefined;
  if (tab === 'overview') return 'overview';
  return tab;
}

export function fleetSubTabFromServiceCenterNav(
  nav: Partial<ServiceCenterNavState> | null | undefined,
): FleetHealthServiceNavState {
  if (!nav) return { ...DEFAULT_FLEET_HEALTH_SERVICE_NAV };
  if (nav.focusTaskId) return { tab: 'work', workSection: 'tasks' };
  if (nav.vendorId) return { tab: 'work', workSection: 'vendors' };
  if (nav.tab) {
    const mapped = serviceCenterTabToFleetSubTab(nav.tab);
    if (mapped) return normalizeFleetHealthServiceTab(mapped);
  }
  if (nav.vehicleId) return { tab: 'work', workSection: 'tasks' };
  return { ...DEFAULT_FLEET_HEALTH_SERVICE_NAV };
}

export const RENTAL_FLEET_HEALTH_SERVICE_NAV_KEY = 'synqdrive_rental_fleet_health_service_nav';

export function readPersistedFleetHealthServiceNav(): FleetHealthServiceNavState {
  try {
    const raw = sessionStorage.getItem(RENTAL_FLEET_HEALTH_SERVICE_NAV_KEY);
    if (!raw) return { ...DEFAULT_FLEET_HEALTH_SERVICE_NAV };
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'string') return normalizeFleetHealthServiceTab(parsed);
    if (parsed && typeof parsed === 'object') {
      return normalizeFleetHealthServiceNavState(parsed as Partial<FleetHealthServiceNavState>);
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_FLEET_HEALTH_SERVICE_NAV };
}

export function persistFleetHealthServiceNav(nav: FleetHealthServiceNavState): void {
  try {
    sessionStorage.setItem(RENTAL_FLEET_HEALTH_SERVICE_NAV_KEY, JSON.stringify(nav));
  } catch {
    /* ignore */
  }
}

const FHS_URL_TAB = 'fhs';
const FHS_URL_WORK = 'fhsWork';

export function fleetHealthServiceNavToSearchParams(nav: FleetHealthServiceNavState): URLSearchParams {
  const params = new URLSearchParams();
  params.set(FHS_URL_TAB, nav.tab);
  if (nav.tab === 'work') params.set(FHS_URL_WORK, nav.workSection);
  return params;
}

export function parseFleetHealthServiceNavFromSearch(
  search: string,
): FleetHealthServiceNavState | null {
  const params = new URLSearchParams(search);
  const tab = params.get(FHS_URL_TAB);
  if (!tab) return null;
  return normalizeFleetHealthServiceTab(tab, params.get(FHS_URL_WORK) ?? undefined);
}

export function applyFleetHealthServiceNavToUrl(
  nav: FleetHealthServiceNavState,
  options?: { replace?: boolean },
): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set(FHS_URL_TAB, nav.tab);
  if (nav.tab === 'work') url.searchParams.set(FHS_URL_WORK, nav.workSection);
  else url.searchParams.delete(FHS_URL_WORK);
  const method = options?.replace ? 'replaceState' : 'pushState';
  window.history[method]({ fleetHealthServiceNav: nav }, '', url);
}
