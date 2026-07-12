import type { DashboardSlice, DashboardSliceRow } from './runtime';
import { buildReadyToRentDrawerGroups } from './dashboardDrilldownRowDisplay';
import { normalizeDashboardDrawerGroups } from './dashboardDrawerNormalize';
import type { TodaysOperationsDrilldownGroupId } from './dashboardDrilldownTypes';

const ACTIVE_RENTED_VEHICLE_GROUP_IDS = new Set([
  'on-time',
  'return-due-soon',
  'return-overdue',
  'critical-during-rental',
]);

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
function buildTodaysOperationsDrawerGroups(
  slice: DashboardSlice,
  focusedGroupId?: TodaysOperationsDrilldownGroupId,
): DashboardDrawerGroup[] {
  const nonEmpty = (slice.groups ?? []).filter((group) => group.rows.length > 0);
  if (focusedGroupId === 'pickups-today' || focusedGroupId === 'returns-today') {
    return nonEmpty.filter((group) => group.id === focusedGroupId);
  }
  if (focusedGroupId === 'active-rentals') {
    return nonEmpty.filter((group) => ACTIVE_RENTED_VEHICLE_GROUP_IDS.has(group.id));
  }
  const order = [
    'pickups-today',
    'returns-today',
    'on-time',
    'return-due-soon',
    'return-overdue',
    'critical-during-rental',
  ];
  return [...nonEmpty].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

export function buildDashboardGroups(
  slice: DashboardSlice,
  locale = 'en',
  options?: { focusedGroupId?: TodaysOperationsDrilldownGroupId },
): DashboardDrawerGroup[] {
  let groups: DashboardDrawerGroup[];

  if (slice.id === 'ready-to-rent') {
    groups = buildReadyToRentDrawerGroups(slice, locale);
  } else if (slice.id === 'active-rented') {
    groups = buildTodaysOperationsDrawerGroups(slice, options?.focusedGroupId);
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
