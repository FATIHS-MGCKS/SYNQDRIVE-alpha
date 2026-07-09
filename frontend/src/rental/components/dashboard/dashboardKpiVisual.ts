import type { DashboardSlice, DashboardSliceId } from './runtime';

export interface OperationalKpiVisualState {
  isCritical: boolean;
  isWatch: boolean;
  /** Card-level success tint — only when the whole card should read positive. */
  isCardSuccess: boolean;
}

/** Presentation tone for KPI cards and values (not business logic). */
export type KpiCardTone = 'neutral' | 'positive' | 'warning' | 'critical' | 'info';

export type KpiValueRole = 'main' | 'footer-left' | 'footer-right' | 'compact';

export function isOverdueSlice(sliceId: DashboardSliceId): boolean {
  return sliceId === 'overdue-returns' || sliceId === 'overdue-pickups';
}

export function isReadySlice(sliceId: DashboardSliceId): boolean {
  return sliceId === 'ready-to-rent';
}

/**
 * Card surface tone — Ready-for-Renting and Today's Operations stay neutral.
 * Overdue / Critical → critical when count > 0; Blocked → warning when count > 0.
 */
export function getKpiCardTone(slice: DashboardSlice): KpiCardTone {
  const count = slice.count ?? 0;

  if (isReadySlice(slice.id) || slice.id === 'active-rented') {
    return 'neutral';
  }

  if (isOverdueSlice(slice.id) || slice.id === 'critical-alerts') {
    return count > 0 ? 'critical' : 'neutral';
  }

  if (slice.id === 'blocked-maintenance') {
    if (count === 0) return 'neutral';
    if (slice.tone === 'critical') return 'critical';
    return 'warning';
  }

  if (count === 0) return 'neutral';
  if (slice.tone === 'critical') return 'critical';
  if (slice.tone === 'watch') return 'warning';
  if (slice.tone === 'info') return 'info';
  return 'neutral';
}

/**
 * Per-value tone inside a card. Ready main → positive; Not ready > 0 → critical;
 * compact KPIs follow card tone when count > 0.
 */
export function getKpiValueTone(
  slice: DashboardSlice,
  role: KpiValueRole,
  options?: { notReadyCount?: number | null },
): KpiCardTone {
  if (isReadySlice(slice.id)) {
    if (role === 'main') return 'positive';
    if (role === 'footer-right' && (options?.notReadyCount ?? 0) > 0) return 'critical';
    return 'neutral';
  }

  if (slice.id === 'active-rented') {
    return 'neutral';
  }

  if (role === 'compact' || role === 'main') {
    return getKpiCardTone(slice);
  }

  return 'neutral';
}

/** Subtle card background + border for warning/critical; neutral relies on `.surface-elevated`. */
export function getKpiCardSurfaceClass(tone: KpiCardTone, _embedded: boolean): string {
  switch (tone) {
    case 'critical':
      return cnJoin(
        'border-[color:color-mix(in_srgb,var(--status-critical)_35%,transparent)]',
        'bg-[linear-gradient(135deg,color-mix(in_srgb,var(--status-critical)_7%,transparent),color-mix(in_srgb,var(--status-critical)_2%,transparent))]',
      );
    case 'warning':
      return cnJoin(
        'border-[color:color-mix(in_srgb,var(--status-warning)_30%,transparent)]',
        'bg-[linear-gradient(135deg,color-mix(in_srgb,var(--status-warning)_7%,transparent),color-mix(in_srgb,var(--status-warning)_2%,transparent))]',
      );
    default:
      return 'border-border/45';
  }
}

/** Text gradient for KPI numbers — positive/warning/critical only; neutral stays solid. */
export function getKpiValueGradientClass(tone: KpiCardTone, disabled = false): string {
  if (disabled || tone === 'neutral' || tone === 'info') {
    return disabled ? 'text-muted-foreground' : 'text-foreground';
  }
  if (tone === 'positive') {
    return 'bg-[linear-gradient(135deg,var(--status-positive),color-mix(in_srgb,var(--status-positive)_65%,var(--foreground)))] bg-clip-text text-transparent';
  }
  if (tone === 'warning') {
    return 'bg-[linear-gradient(135deg,var(--status-warning),color-mix(in_srgb,var(--status-warning)_65%,var(--foreground)))] bg-clip-text text-transparent';
  }
  return 'bg-[linear-gradient(135deg,var(--status-critical),color-mix(in_srgb,var(--status-critical)_65%,var(--foreground)))] bg-clip-text text-transparent';
}

/** Soft icon tile — Ready icon subtly positive; warning/critical when card is hot. */
export function getKpiIconTileClass(slice: DashboardSlice): string {
  const count = slice.count ?? 0;
  const cardTone = getKpiCardTone(slice);

  if (isReadySlice(slice.id)) {
    return 'bg-[color:color-mix(in_srgb,var(--status-positive)_10%,transparent)] text-[color:var(--status-positive)]';
  }

  if (slice.id === 'active-rented') {
    return count > 0
      ? 'bg-[color:color-mix(in_srgb,var(--status-info)_10%,transparent)] text-[color:var(--status-info)]'
      : 'bg-muted text-muted-foreground';
  }

  switch (cardTone) {
    case 'critical':
      return 'bg-[color:color-mix(in_srgb,var(--status-critical)_10%,transparent)] text-[color:var(--status-critical)]';
    case 'warning':
      return 'bg-[color:color-mix(in_srgb,var(--status-warning)_10%,transparent)] text-[color:var(--status-warning)]';
    case 'info':
      return 'bg-[color:color-mix(in_srgb,var(--status-info)_10%,transparent)] text-[color:var(--status-info)]';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function cnJoin(...parts: string[]): string {
  return parts.filter(Boolean).join(' ');
}

/** Operational KPI card flags (dot indicator, legacy consumers). */
export function getOperationalKpiVisualState(slice: DashboardSlice): OperationalKpiVisualState {
  const cardTone = getKpiCardTone(slice);
  return {
    isCritical: cardTone === 'critical',
    isWatch: cardTone === 'warning',
    isCardSuccess: false,
  };
}

/** @deprecated Use getKpiIconTileClass */
export function operationalKpiIconToneClass(slice: DashboardSlice): string {
  return getKpiIconTileClass(slice);
}

/** @deprecated Use getKpiValueGradientClass + getKpiValueTone */
export function operationalKpiValueToneClass(
  slice: DashboardSlice,
  options?: { emphasizePositiveMainValue?: boolean },
): string {
  const role = options?.emphasizePositiveMainValue ? 'main' : 'compact';
  const tone = getKpiValueTone(slice, role);
  return getKpiValueGradientClass(tone);
}
