/** Accessibility IDs and helpers for Auswertungen (Prompt 35/54). */

export const EVAL_SW_COCKPIT_PANEL_ID = 'eval-sw-cockpit-panel';
export const EVAL_SW_COCKPIT_TAB_ALL_ID = 'eval-sw-tab-all';

export function evalSwCategoryTabId(category: string): string {
  return `eval-sw-tab-${category.toLowerCase().replace(/_/g, '-')}`;
}

export const EVAL_DIM_TAB_STATION_ID = 'eval-dim-tab-station';
export const EVAL_DIM_TAB_VEHICLE_CLASS_ID = 'eval-dim-tab-vehicle-class';
