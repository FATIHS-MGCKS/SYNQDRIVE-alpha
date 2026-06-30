import type { DashboardSlice, DashboardSliceRow } from './runtime';
import { buildReadyToRentDrawerGroups } from './dashboardDrilldownRowDisplay';
import { normalizeDashboardDrawerGroups } from './dashboardDrawerNormalize';

export interface DashboardDrawerGroup {
  id: string;
  title: string;
  count: number;
  rows: DashboardSliceRow[];
}

/**
 * Builds drawer sections strictly from the runtime slice.
 * `groups` is the canonical grouping source; `secondaryRows` is never rendered
 * as an extra section when groups already contain those rows.
 */
export function buildDashboardGroups(slice: DashboardSlice, locale = 'en'): DashboardDrawerGroup[] {
  let groups: DashboardDrawerGroup[];

  if (slice.id === 'ready-to-rent') {
    groups = buildReadyToRentDrawerGroups(slice, locale);
  } else {
    const nonEmptyGroups = (slice.groups ?? []).filter((group) => group.rows.length > 0);
    if (nonEmptyGroups.length > 0) {
      groups = nonEmptyGroups;
    } else if (slice.rows.length > 0) {
      groups = [
        {
          id: `${slice.id}:primary`,
          title: slice.title,
          count: slice.rows.length,
          rows: slice.rows,
        },
      ];
    } else {
      groups = [];
    }
  }

  return normalizeDashboardDrawerGroups(groups, locale);
}

/** Collects unique row ids across drawer groups (for dedupe tests). */
export function collectDrawerRowIds(groups: DashboardDrawerGroup[]): string[] {
  return groups.flatMap((group) => group.rows.map((row) => row.id));
}
