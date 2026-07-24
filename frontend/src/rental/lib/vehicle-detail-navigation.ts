import {
  isVehicleDetailTab,
  VEHICLE_DETAIL_TAB_KEYS,
} from './vehicle-overview-navigation';
import type { VehicleDetailTab } from './vehicle-overview.types';

/** Query param for vehicle detail deep links — matches operator convention. */
export const VEHICLE_DETAIL_ID_PARAM = 'vehicleId';

/** Namespaced tab param — avoids collision with finance `view` and fleet-health `fhs*`. */
export const VEHICLE_DETAIL_TAB_PARAM = 'vdTab';

/** Legacy alias kept for backward-compatible deep links. */
export const VEHICLE_DETAIL_TAB_PARAM_LEGACY = 'vehicleTab';

export const DEFAULT_VEHICLE_DETAIL_TAB: VehicleDetailTab = 'overview';

export const VEHICLE_DETAIL_VIEWS = new Set<string>(VEHICLE_DETAIL_TAB_KEYS);

export interface VehicleDetailUrlState {
  vehicleId: string;
  tab: VehicleDetailTab;
}

export function normalizeVehicleDetailTab(
  tab: string | null | undefined,
): VehicleDetailTab {
  if (tab && isVehicleDetailTab(tab)) return tab;
  return DEFAULT_VEHICLE_DETAIL_TAB;
}

export function parseVehicleDetailFromUrl(search = ''): VehicleDetailUrlState | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const vehicleId = params.get(VEHICLE_DETAIL_ID_PARAM)?.trim();
  if (!vehicleId) return null;

  const tabParam =
    params.get(VEHICLE_DETAIL_TAB_PARAM) ?? params.get(VEHICLE_DETAIL_TAB_PARAM_LEGACY);
  return {
    vehicleId,
    tab: normalizeVehicleDetailTab(tabParam),
  };
}

export function vehicleDetailToSearchParams(state: VehicleDetailUrlState): URLSearchParams {
  const params = new URLSearchParams();
  params.set(VEHICLE_DETAIL_ID_PARAM, state.vehicleId);
  if (state.tab !== DEFAULT_VEHICLE_DETAIL_TAB) {
    params.set(VEHICLE_DETAIL_TAB_PARAM, state.tab);
  }
  return params;
}

export function applyVehicleDetailToUrl(
  state: VehicleDetailUrlState | null,
  options?: { replace?: boolean },
): void {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);

  if (!state) {
    url.searchParams.delete(VEHICLE_DETAIL_ID_PARAM);
    url.searchParams.delete(VEHICLE_DETAIL_TAB_PARAM);
    url.searchParams.delete(VEHICLE_DETAIL_TAB_PARAM_LEGACY);
  } else {
    url.searchParams.set(VEHICLE_DETAIL_ID_PARAM, state.vehicleId);
    if (state.tab === DEFAULT_VEHICLE_DETAIL_TAB) {
      url.searchParams.delete(VEHICLE_DETAIL_TAB_PARAM);
      url.searchParams.delete(VEHICLE_DETAIL_TAB_PARAM_LEGACY);
    } else {
      url.searchParams.set(VEHICLE_DETAIL_TAB_PARAM, state.tab);
      url.searchParams.delete(VEHICLE_DETAIL_TAB_PARAM_LEGACY);
    }
  }

  const method = options?.replace ? 'replaceState' : 'pushState';
  window.history[method]({ vehicleDetailNav: state }, '', url);
}

export function clearVehicleDetailFromUrl(options?: { replace?: boolean }): void {
  applyVehicleDetailToUrl(null, options);
}

export function isVehicleDetailUrlActive(search = ''): boolean {
  return parseVehicleDetailFromUrl(search) !== null;
}
