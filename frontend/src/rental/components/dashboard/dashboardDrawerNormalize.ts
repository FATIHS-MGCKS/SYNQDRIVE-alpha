import { semanticDedupeDisplayReasons } from './reasonDisplay';
import type { DashboardDrawerGroup } from './dashboardDrilldownGroups';
import type { DashboardSlice, DashboardSliceRow } from './runtime';

function worseSeverity(
  a: DashboardSliceRow['severity'],
  b: DashboardSliceRow['severity'],
): DashboardSliceRow['severity'] {
  const rank: Record<DashboardSliceRow['severity'], number> = {
    critical: 4,
    warning: 3,
    info: 2,
    success: 1,
    neutral: 0,
  };
  return rank[a] >= rank[b] ? a : b;
}

function mergeKey(row: DashboardSliceRow): string | null {
  if (row.bookingId) return `booking:${row.bookingId}`;
  if (row.vehicleId) return `vehicle:${row.vehicleId}`;
  return null;
}

/**
 * Merges rows that refer to the same vehicle/booking within one drawer group.
 * Reasons are combined and semantically deduplicated; meta is cleared to avoid
 * duplicate visible copy alongside reason chips/lines.
 */
export function mergeDrawerGroupRows(rows: DashboardSliceRow[], locale: string): DashboardSliceRow[] {
  const merged = new Map<string, DashboardSliceRow>();
  const passthrough: DashboardSliceRow[] = [];

  for (const row of rows) {
    const key = mergeKey(row);
    if (!key) {
      passthrough.push(row);
      continue;
    }

    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        ...row,
        meta: undefined,
        reasons: row.reasons
          ? semanticDedupeDisplayReasons(row.reasons, locale)
          : undefined,
        reasonIds: row.reasons
          ? semanticDedupeDisplayReasons(row.reasons, locale).map((reason) => reason.id)
          : undefined,
      });
      continue;
    }

    const combinedReasons = semanticDedupeDisplayReasons(
      [...(existing.reasons ?? []), ...(row.reasons ?? [])],
      locale,
    );

    merged.set(key, {
      ...existing,
      severity: worseSeverity(existing.severity, row.severity),
      reasons: combinedReasons.length > 0 ? combinedReasons : undefined,
      reasonIds: combinedReasons.length > 0 ? combinedReasons.map((reason) => reason.id) : undefined,
      meta: undefined,
    });
  }

  return [...merged.values(), ...passthrough];
}

export function normalizeDashboardDrawerGroups(
  groups: DashboardDrawerGroup[],
  locale: string,
): DashboardDrawerGroup[] {
  return groups.map((group) => {
    const rows = mergeDrawerGroupRows(group.rows, locale);
    return {
      ...group,
      rows,
      count: rows.length,
    };
  });
}

export function drawerHeaderHint(slice: DashboardSlice, locale: string): string | undefined {
  const de = locale === 'de';

  if (slice.id === 'ready-to-rent') {
    return undefined;
  }

  if (slice.id === 'critical-alerts') {
    const count = slice.count ?? 0;
    return de
      ? `${count} Fahrzeug${count === 1 ? '' : 'e'} mit kritischen Hinweisen`
      : `${count} vehicle${count === 1 ? '' : 's'} with critical alerts`;
  }

  if (slice.id === 'due-soon') {
    const count = slice.count ?? 0;
    return de
      ? `${count} Übergabe${count === 1 ? '' : 'n'} oder Rückgabe${count === 1 ? '' : 'n'} bald fällig`
      : `${count} pickup${count === 1 ? '' : 's'} or return${count === 1 ? '' : 's'} due soon`;
  }

  if (slice.id === 'overdue-returns') {
    const count = slice.count ?? 0;
    return de
      ? `${count} überfällige Rückgabe${count === 1 ? '' : 'n'}`
      : `${count} overdue return${count === 1 ? '' : 's'}`;
  }

  if (slice.id === 'blocked-maintenance') {
    const count = slice.count ?? 0;
    return de
      ? `${count} Fahrzeug${count === 1 ? '' : 'e'} blockiert oder in Wartung`
      : `${count} vehicle${count === 1 ? '' : 's'} blocked or in maintenance`;
  }

  if (slice.id === 'active-rented') {
    const count = slice.count ?? 0;
    return de
      ? `${count} aktive Vermietung${count === 1 ? '' : 'en'}`
      : `${count} active rental${count === 1 ? '' : 's'}`;
  }

  return slice.hint;
}
