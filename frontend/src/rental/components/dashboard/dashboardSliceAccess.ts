import type { DashboardSlice, DashboardSliceRow } from './runtime';

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

function groupHasCriticalRows(slice: DashboardSlice, groupId: string): boolean {
  const rows = slice.groups?.find((group) => group.id === groupId)?.rows ?? [];
  return rows.some((row) => row.severity === 'critical');
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

  const activeRentalsCount = slice.count ?? slice.rows.length;
  const pickupsToday = slice.groups?.find((group) => group.id === 'pickups-today')?.count ?? 0;
  const returnsToday = slice.groups?.find((group) => group.id === 'returns-today')?.count ?? 0;

  return {
    activeRentalsCount,
    pickupsToday,
    returnsToday,
    hasOverduePickups: groupHasCriticalRows(slice, 'pickups-today'),
    hasOverdueReturns: groupHasCriticalRows(slice, 'returns-today'),
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
