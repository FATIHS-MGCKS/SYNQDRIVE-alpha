import type { DashboardSlice, DashboardSliceRow } from './runtime';
import { TODAYS_OPERATIONAL_GROUP_IDS } from './runtime/todaysOperationalSlice';
import { buildReadyToRentDrawerGroups } from './dashboardDrilldownRowDisplay';
import { normalizeDashboardDrawerGroups } from './dashboardDrawerNormalize';
import type { TodaysOperationsDrilldownGroupId } from './dashboardDrilldownTypes';

const ACTIVE_RENTED_VEHICLE_GROUP_IDS = new Set<string>([TODAYS_OPERATIONAL_GROUP_IDS.ACTIVE_RENTED_NOW]);

const TODAYS_OPERATIONS_DRAWER_ORDER = [
  TODAYS_OPERATIONAL_GROUP_IDS.ACTIVE_RENTED_NOW,
  TODAYS_OPERATIONAL_GROUP_IDS.RESERVED_PICKUP_TODAY,
  TODAYS_OPERATIONAL_GROUP_IDS.PICKUPS_TODAY,
  TODAYS_OPERATIONAL_GROUP_IDS.RETURNS_TODAY,
  TODAYS_OPERATIONAL_GROUP_IDS.OVERDUE_PICKUPS,
  TODAYS_OPERATIONAL_GROUP_IDS.OVERDUE_RETURNS,
] as const;

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
  return [...nonEmpty].sort(
    (a, b) => TODAYS_OPERATIONS_DRAWER_ORDER.indexOf(a.id as (typeof TODAYS_OPERATIONS_DRAWER_ORDER)[number])
      - TODAYS_OPERATIONS_DRAWER_ORDER.indexOf(b.id as (typeof TODAYS_OPERATIONS_DRAWER_ORDER)[number]),
  );
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
