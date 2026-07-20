import type { ServiceCenterNavState } from '../../lib/service-center-navigation';
import type { FleetHealthServiceTab } from './fleet-health-service.types';

/** Internal views under the future consolidated „Arbeiten“ area. */
export type FleetHealthServiceWorkView = 'tasks' | 'service-cases' | 'due-dates';

export const FLEET_HEALTH_SERVICE_WORK_VIEW_ORDER: FleetHealthServiceWorkView[] = [
  'tasks',
  'service-cases',
  'due-dates',
];

export const FHS_WORK_AREA_LOCAL_STORAGE_KEY = 'synqdrive.fhs.work-area';

export function isFleetHealthServiceWorkAreaEnabled(): boolean {
  if (import.meta.env.VITE_FHS_WORK_AREA === '1') return true;
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(FHS_WORK_AREA_LOCAL_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isFleetHealthServiceWorkAreaSubTab(tab: FleetHealthServiceTab): boolean {
  return tab === 'tasks' || tab === 'schedule';
}

export function resolveWorkViewFromFleetSubTab(
  tab: FleetHealthServiceTab,
): FleetHealthServiceWorkView | null {
  switch (tab) {
    case 'tasks':
      return 'tasks';
    case 'schedule':
      return 'due-dates';
    default:
      return null;
  }
}

/**
 * Maps an internal work view back to the current top-level FHS subtab.
 * Service cases remain on the legacy `tasks` subtab until IA consolidation ships.
 */
export function resolveFleetSubTabForWorkView(
  view: FleetHealthServiceWorkView,
): FleetHealthServiceTab {
  switch (view) {
    case 'due-dates':
      return 'schedule';
    case 'tasks':
    case 'service-cases':
    default:
      return 'tasks';
  }
}

export function resolveWorkViewFromServiceCenterNav(
  nav: Partial<ServiceCenterNavState> | null | undefined,
  fallback: FleetHealthServiceWorkView = 'tasks',
): FleetHealthServiceWorkView {
  if (!nav) return fallback;
  if (nav.focusTaskId) return 'tasks';
  if (nav.tab === 'schedule') return 'due-dates';
  if (nav.tab === 'tasks' || nav.vehicleId || nav.taskFilter || nav.taskType || nav.taskStatus) {
    return 'tasks';
  }
  return fallback;
}
