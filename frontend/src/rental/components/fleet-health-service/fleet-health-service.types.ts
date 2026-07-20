import type { ApiTaskStatus } from '../../../lib/api';
import type { ServiceCenterNavState } from '../../lib/service-center-navigation';
import type { OperatorStatusFilter } from '../../lib/fleet-health-control-center';
import type { ServiceTaskAdvancedFilters } from '../../lib/service-task-filters';
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

/** Canonical service-case filter (P56). */
export type FleetHealthServiceCaseFilter = 'blocking';

export type FleetHealthServiceTaskStatusFilter = ApiTaskStatus | 'ACTIVE' | 'ALL';

export interface FleetHealthServiceNavState {
  tab: FleetHealthServiceTab;
  workSection: FleetHealthServiceWorkSection;
  /** Vehicle health status filter (Fahrzeuge). */
  vehicleStatusFilter?: OperatorStatusFilter;
  /** Task KPI filter (Arbeiten → Aufgaben). */
  taskFilter?: ServiceTaskFilter;
  /** Open rental-blocking service cases (Fahrzeuge). */
  serviceCaseFilter?: FleetHealthServiceCaseFilter;
  /** Entity scope — vehicle. */
  vehicleId?: string;
  /** Entity scope — station. */
  stationId?: string;
  /** Entity scope — partner / vendor. */
  vendorId?: string;
  /** Task status filter (Arbeiten → Aufgaben). */
  taskStatus?: FleetHealthServiceTaskStatusFilter;
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

const VEHICLE_STATUS_FILTERS = new Set<OperatorStatusFilter>([
  'all',
  'blocked',
  'action',
  'review',
  'good',
  'limited',
]);

const TASK_FILTERS = new Set<ServiceTaskFilter>([
  'all',
  'overdue',
  'due-today',
  'due-soon',
  'in-progress',
  'waiting-vendor',
  'urgent',
  'tuv',
  'repairs',
  'service',
]);

const TASK_STATUS_FILTERS = new Set<FleetHealthServiceTaskStatusFilter>([
  'ALL',
  'ACTIVE',
  'OPEN',
  'IN_PROGRESS',
  'WAITING',
  'DONE',
  'CANCELLED',
]);

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

function normalizeWorkSection(
  value: FleetHealthServiceWorkSection | string | undefined,
): FleetHealthServiceWorkSection {
  if (value === 'tasks' || value === 'schedule' || value === 'vendors') return value;
  return 'tasks';
}

function pickNavFilters(
  input: Partial<FleetHealthServiceNavState> | null | undefined,
): Partial<FleetHealthServiceNavState> {
  if (!input) return {};
  return {
    vehicleStatusFilter: input.vehicleStatusFilter,
    taskFilter: input.taskFilter,
    serviceCaseFilter: input.serviceCaseFilter,
    vehicleId: input.vehicleId,
    stationId: input.stationId,
    vendorId: input.vendorId,
    taskStatus: input.taskStatus,
  };
}

export function normalizeFleetHealthServiceTab(
  input: FleetHealthServiceTabInput | string,
  workSectionHint?: FleetHealthServiceWorkSection | string,
  filters?: Partial<FleetHealthServiceNavState>,
): FleetHealthServiceNavState {
  let base: FleetHealthServiceNavState;
  switch (input) {
    case 'overview':
    case 'vehicles':
    case 'work':
    case 'history':
      base = {
        tab: input,
        workSection: normalizeWorkSection(workSectionHint),
      };
      break;
    case 'tasks':
      base = { tab: 'work', workSection: 'tasks' };
      break;
    case 'schedule':
      base = { tab: 'work', workSection: 'schedule' };
      break;
    case 'vendors':
      base = { tab: 'work', workSection: 'vendors' };
      break;
    default:
      base = { ...DEFAULT_FLEET_HEALTH_SERVICE_NAV };
  }
  return sanitizeFleetHealthServiceNavState({ ...base, ...pickNavFilters(filters) });
}

export function sanitizeFleetHealthServiceNavState(
  nav: FleetHealthServiceNavState,
): FleetHealthServiceNavState {
  const next: FleetHealthServiceNavState = {
    tab: nav.tab,
    workSection: normalizeWorkSection(nav.workSection),
  };

  if (nav.vehicleStatusFilter && VEHICLE_STATUS_FILTERS.has(nav.vehicleStatusFilter)) {
    if (nav.vehicleStatusFilter !== 'all') {
      next.vehicleStatusFilter = nav.vehicleStatusFilter;
    }
  }

  if (nav.taskFilter && TASK_FILTERS.has(nav.taskFilter) && nav.taskFilter !== 'all') {
    next.taskFilter = nav.taskFilter;
  }

  if (nav.serviceCaseFilter === 'blocking') {
    next.serviceCaseFilter = 'blocking';
  }

  if (nav.vehicleId?.trim()) next.vehicleId = nav.vehicleId.trim();
  if (nav.stationId?.trim()) next.stationId = nav.stationId.trim();
  if (nav.vendorId?.trim()) next.vendorId = nav.vendorId.trim();

  if (nav.taskStatus && TASK_STATUS_FILTERS.has(nav.taskStatus)) {
    if (nav.taskStatus !== 'ALL') next.taskStatus = nav.taskStatus;
  }

  // Task KPI filters belong on the tasks section — not the vendor directory.
  if (next.taskFilter && next.tab === 'work') {
    next.workSection = 'tasks';
  }

  // Blocking service cases are evaluated on the vehicles surface.
  if (next.serviceCaseFilter === 'blocking' && next.tab === 'overview') {
    next.tab = 'vehicles';
  }

  return next;
}

export function clearFleetHealthServiceNavFilters(
  nav: FleetHealthServiceNavState,
): FleetHealthServiceNavState {
  return {
    tab: nav.tab,
    workSection: nav.workSection,
  };
}

export function fleetHealthServiceNavHasActiveFilters(
  nav: FleetHealthServiceNavState,
): boolean {
  return Boolean(
    nav.vehicleStatusFilter ||
      nav.taskFilter ||
      nav.serviceCaseFilter ||
      nav.vehicleId ||
      nav.stationId ||
      nav.vendorId ||
      nav.taskStatus,
  );
}

export function fleetHealthServiceNavToTaskAdvancedFilters(
  nav: FleetHealthServiceNavState,
): Partial<ServiceTaskAdvancedFilters> {
  const patch: Partial<ServiceTaskAdvancedFilters> = {};
  if (nav.vehicleId) patch.vehicleId = nav.vehicleId;
  if (nav.vendorId) patch.vendorId = nav.vendorId;
  if (nav.stationId) patch.stationId = nav.stationId;
  if (nav.taskStatus) patch.status = nav.taskStatus;
  if (nav.taskFilter) patch.kpiFilter = nav.taskFilter;
  return patch;
}

export function normalizeFleetHealthServiceNavState(
  input: Partial<FleetHealthServiceNavState> | FleetHealthServiceTabInput | string | null | undefined,
): FleetHealthServiceNavState {
  if (!input) return { ...DEFAULT_FLEET_HEALTH_SERVICE_NAV };
  if (typeof input === 'string') return normalizeFleetHealthServiceTab(input);
  if ('tab' in input && input.tab) {
    return normalizeFleetHealthServiceTab(input.tab, input.workSection, input);
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

  let base: FleetHealthServiceNavState;
  if (nav.focusTaskId) {
    base = { tab: 'work', workSection: 'tasks' };
  } else if (nav.vendorId && !nav.taskFilter) {
    base = { tab: 'work', workSection: 'vendors' };
  } else if (nav.tab) {
    const mapped = serviceCenterTabToFleetSubTab(nav.tab);
    base = mapped ? normalizeFleetHealthServiceTab(mapped) : { ...DEFAULT_FLEET_HEALTH_SERVICE_NAV };
  } else if (nav.vehicleId) {
    base = { tab: 'work', workSection: 'tasks' };
  } else {
    base = { ...DEFAULT_FLEET_HEALTH_SERVICE_NAV };
  }

  return sanitizeFleetHealthServiceNavState({
    ...base,
    vehicleId: nav.vehicleId,
    vendorId: nav.vendorId,
    taskFilter: nav.taskFilter,
    taskStatus: nav.taskStatus,
  });
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
const FHS_URL_VEHICLE_FILTER = 'fhsVf';
const FHS_URL_TASK_FILTER = 'fhsTf';
const FHS_URL_CASE_FILTER = 'fhsCase';
const FHS_URL_VEHICLE = 'fhsV';
const FHS_URL_STATION = 'fhsSt';
const FHS_URL_VENDOR = 'fhsVen';
const FHS_URL_TASK_STATUS = 'fhsTs';

/** @deprecated Legacy alias — still parsed for older bookmarks. */
const FHS_URL_VEHICLE_FILTER_LEGACY = 'vehicleStatusFilter';
/** @deprecated Legacy alias — still parsed for older bookmarks. */
const FHS_URL_TASK_FILTER_LEGACY = 'taskFilter';

function setOptionalParam(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value) params.set(key, value);
  else params.delete(key);
}

export function fleetHealthServiceNavToSearchParams(nav: FleetHealthServiceNavState): URLSearchParams {
  const sanitized = sanitizeFleetHealthServiceNavState(nav);
  const params = new URLSearchParams();
  params.set(FHS_URL_TAB, sanitized.tab);
  if (sanitized.tab === 'work') params.set(FHS_URL_WORK, sanitized.workSection);
  else params.delete(FHS_URL_WORK);

  setOptionalParam(params, FHS_URL_VEHICLE_FILTER, sanitized.vehicleStatusFilter);
  setOptionalParam(params, FHS_URL_TASK_FILTER, sanitized.taskFilter);
  setOptionalParam(params, FHS_URL_CASE_FILTER, sanitized.serviceCaseFilter);
  setOptionalParam(params, FHS_URL_VEHICLE, sanitized.vehicleId);
  setOptionalParam(params, FHS_URL_STATION, sanitized.stationId);
  setOptionalParam(params, FHS_URL_VENDOR, sanitized.vendorId);
  setOptionalParam(params, FHS_URL_TASK_STATUS, sanitized.taskStatus);

  return params;
}

function readFilterParam(
  params: URLSearchParams,
  canonical: string,
  legacy?: string,
): string | null {
  return params.get(canonical) ?? (legacy ? params.get(legacy) : null);
}

export function parseFleetHealthServiceNavFromSearch(
  search: string,
): FleetHealthServiceNavState | null {
  const params = new URLSearchParams(search);
  const tab = params.get(FHS_URL_TAB);
  if (!tab) return null;

  const vehicleStatusFilter = readFilterParam(
    params,
    FHS_URL_VEHICLE_FILTER,
    FHS_URL_VEHICLE_FILTER_LEGACY,
  ) as OperatorStatusFilter | null;
  const taskFilter = readFilterParam(
    params,
    FHS_URL_TASK_FILTER,
    FHS_URL_TASK_FILTER_LEGACY,
  ) as ServiceTaskFilter | null;
  const serviceCaseFilter = params.get(FHS_URL_CASE_FILTER) as FleetHealthServiceCaseFilter | null;
  const taskStatus = params.get(FHS_URL_TASK_STATUS) as FleetHealthServiceTaskStatusFilter | null;

  return sanitizeFleetHealthServiceNavState({
    ...normalizeFleetHealthServiceTab(tab, params.get(FHS_URL_WORK) ?? undefined),
    vehicleStatusFilter: vehicleStatusFilter ?? undefined,
    taskFilter: taskFilter ?? undefined,
    serviceCaseFilter: serviceCaseFilter === 'blocking' ? 'blocking' : undefined,
    vehicleId: params.get(FHS_URL_VEHICLE) ?? undefined,
    stationId: params.get(FHS_URL_STATION) ?? undefined,
    vendorId: params.get(FHS_URL_VENDOR) ?? undefined,
    taskStatus: taskStatus ?? undefined,
  });
}

export function applyFleetHealthServiceNavToUrl(
  nav: FleetHealthServiceNavState,
  options?: { replace?: boolean },
): void {
  if (typeof window === 'undefined') return;
  const sanitized = sanitizeFleetHealthServiceNavState(nav);
  const url = new URL(window.location.href);
  const params = fleetHealthServiceNavToSearchParams(sanitized);

  for (const [key, value] of params.entries()) {
    url.searchParams.set(key, value);
  }

  for (const key of [
    FHS_URL_WORK,
    FHS_URL_VEHICLE_FILTER,
    FHS_URL_TASK_FILTER,
    FHS_URL_CASE_FILTER,
    FHS_URL_VEHICLE,
    FHS_URL_STATION,
    FHS_URL_VENDOR,
    FHS_URL_TASK_STATUS,
    FHS_URL_VEHICLE_FILTER_LEGACY,
    FHS_URL_TASK_FILTER_LEGACY,
  ]) {
    if (!params.has(key)) url.searchParams.delete(key);
  }

  const method = options?.replace ? 'replaceState' : 'pushState';
  window.history[method]({ fleetHealthServiceNav: sanitized }, '', url);
}
