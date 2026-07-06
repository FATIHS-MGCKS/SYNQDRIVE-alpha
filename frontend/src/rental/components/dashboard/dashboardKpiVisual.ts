import type { DashboardSlice, DashboardSliceId } from './runtime';

export interface OperationalKpiVisualState {
  isCritical: boolean;
  isWatch: boolean;
  /** Card-level success tint — only when the whole card should read positive. */
  isCardSuccess: boolean;
}

export function isOverdueSlice(sliceId: DashboardSliceId): boolean {
  return sliceId === 'overdue-returns' || sliceId === 'overdue-pickups';
}

export function isReadySlice(sliceId: DashboardSliceId): boolean {
  return sliceId === 'ready-to-rent';
}

/** Operational KPI card + icon visual rules (presentation only). */
export function getOperationalKpiVisualState(slice: DashboardSlice): OperationalKpiVisualState {
  const count = slice.count ?? 0;

  if (isOverdueSlice(slice.id)) {
    return {
      isCritical: count > 0,
      isWatch: false,
      isCardSuccess: false,
    };
  }

  if (isReadySlice(slice.id) || slice.id === 'active-rented') {
    return {
      isCritical: false,
      isWatch: false,
      isCardSuccess: false,
    };
  }

  if (slice.id === 'critical-alerts') {
    return {
      isCritical: count > 0,
      isWatch: false,
      isCardSuccess: false,
    };
  }

  if (slice.id === 'blocked-maintenance') {
    return {
      isCritical: slice.tone === 'critical' && count > 0,
      isWatch: slice.tone === 'watch' && count > 0,
      isCardSuccess: false,
    };
  }

  return {
    isCritical: slice.tone === 'critical' && count > 0,
    isWatch: slice.tone === 'watch' && count > 0,
    isCardSuccess: slice.tone === 'success' && count > 0,
  };
}

export function operationalKpiIconToneClass(slice: DashboardSlice): string {
  const count = slice.count ?? 0;
  const visual = getOperationalKpiVisualState(slice);

  if (isReadySlice(slice.id)) {
    return 'sq-tone-success';
  }

  if (slice.id === 'active-rented') {
    return 'sq-tone-info';
  }

  if (visual.isCritical) return 'sq-tone-critical';
  if (visual.isWatch) return 'sq-tone-watch';
  if (slice.tone === 'info') return 'sq-tone-info';
  return 'bg-muted text-muted-foreground';
}

export function operationalKpiValueToneClass(
  slice: DashboardSlice,
  options?: { emphasizePositiveMainValue?: boolean },
): string {
  const visual = getOperationalKpiVisualState(slice);
  if (visual.isCritical) return 'text-[color:var(--status-critical)]';
  if (options?.emphasizePositiveMainValue && isReadySlice(slice.id)) {
    return 'text-[color:var(--status-positive)]';
  }
  if (visual.isWatch) return 'text-[color:var(--status-watch)]';
  return 'text-foreground';
}
