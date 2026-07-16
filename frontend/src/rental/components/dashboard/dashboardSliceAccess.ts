import type { DashboardSlice, DashboardSliceRow } from './runtime';
import { TODAYS_OPERATIONAL_GROUP_IDS } from './runtime/todaysOperationalSlice';

/**
 * Canonical not-ready rows for ready-to-rent.
 * `secondaryRows` mirrors this set for programmatic access only — active UI
 * must read from `groups`, never append `secondaryRows` separately.
 */
export function readyToRentNotReadyRows(slice: DashboardSlice): DashboardSliceRow[] {
  if (slice.id !== 'ready-to-rent') return [];
  return slice.groups?.find((group) => group.id === 'available-but-not-ready')?.rows ?? [];
}

/** Canonical ready rows for the ready-to-rent drawer Ready section. */
export function readyToRentReadyRows(slice: DashboardSlice): DashboardSliceRow[] {
  if (slice.id !== 'ready-to-rent') return slice.rows;
  return slice.groups?.find((group) => group.id === 'ready-now')?.rows ?? slice.rows;
}

export interface TodaysOperationsKpiCounts {
  activeRentalsCount: number | null;
  pickupsToday: number;
  returnsToday: number;
  hasOverduePickups: boolean;
  hasOverdueReturns: boolean;
}

function groupCount(slice: DashboardSlice, groupId: string): number {
  return slice.groups?.find((group) => group.id === groupId)?.count ?? 0;
}

/** KPI counts for Today's Operations card — reads runtime slice groups only. */
export function resolveTodaysOperationsKpiCounts(slice: DashboardSlice): TodaysOperationsKpiCounts {
  if (slice.id !== 'active-rented' || slice.count === null) {
    return {
      activeRentalsCount: slice.count,
      pickupsToday: 0,
      returnsToday: 0,
      hasOverduePickups: false,
      hasOverdueReturns: false,
    };
  }

  const activeRentalsCount =
    groupCount(slice, TODAYS_OPERATIONAL_GROUP_IDS.ACTIVE_RENTED_NOW) || slice.count || slice.rows.length;
  const pickupsToday = groupCount(slice, TODAYS_OPERATIONAL_GROUP_IDS.PICKUPS_TODAY);
  const returnsToday = groupCount(slice, TODAYS_OPERATIONAL_GROUP_IDS.RETURNS_TODAY);

  return {
    activeRentalsCount,
    pickupsToday,
    returnsToday,
    hasOverduePickups: groupCount(slice, TODAYS_OPERATIONAL_GROUP_IDS.OVERDUE_PICKUPS) > 0,
    hasOverdueReturns: groupCount(slice, TODAYS_OPERATIONAL_GROUP_IDS.OVERDUE_RETURNS) > 0,
  };
}

export interface ReadyForRentingKpiCounts {
  readyCount: number | null;
  availableCount: number;
  notReadyCount: number;
}

/** KPI footer counts for the Ready-for-Renting card — reads runtime slice groups only. */
export function resolveReadyForRentingKpiCounts(slice: DashboardSlice): ReadyForRentingKpiCounts {
  if (slice.id !== 'ready-to-rent' || slice.count === null) {
    return { readyCount: slice.count, availableCount: 0, notReadyCount: 0 };
  }

  const readyCount = slice.count ?? slice.rows.length;
  const readyGroupCount =
    slice.groups?.find((group) => group.id === 'ready-now')?.count ?? readyCount;
  const notReadyCount =
    slice.groups?.find((group) => group.id === 'available-but-not-ready')?.count ?? 0;

  return {
    readyCount,
    availableCount: readyGroupCount + notReadyCount,
    notReadyCount,
  };
}
