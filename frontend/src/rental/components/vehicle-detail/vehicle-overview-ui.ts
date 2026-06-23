import type {
  VehicleOverviewCardStatus,
  VehicleOverviewQuickCardId,
  VehicleOverviewReadinessTone,
} from '../../lib/vehicle-overview.types';

/** Shared surface tokens — Vehicle Detail Overview quick view. */
export const vo = {
  page: 'flex flex-col gap-4 sm:gap-5 mb-4 min-w-0 max-w-full overflow-x-clip',
  stack: 'flex flex-col gap-2.5 sm:gap-3 min-w-0',
  snapshotSection: 'flex flex-col gap-2 min-w-0',
  snapshotLabel:
    'text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80 px-0.5',
  mainSection:
    'pt-1 sm:pt-1.5 border-t border-border/40 min-w-0',
  mainGrid:
    'grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-5 items-stretch min-w-0',
  mapColumn: 'min-w-0 lg:col-span-3',
  healthColumn: 'flex min-h-0 min-w-0 flex-col lg:col-span-2',
  freshnessHint:
    'text-center text-[10px] leading-relaxed text-muted-foreground/70 pt-1 px-2 tabular-nums border-t border-border/30',
  readiness:
    'sq-card sq-glass rounded-2xl border shadow-[var(--shadow-1)] px-4 py-3.5 sm:px-5 sm:py-4 min-h-[44px]',
  cardScroll:
    'flex gap-2 sm:gap-2.5 overflow-x-auto overscroll-x-contain pb-0.5 pt-0.5 snap-x snap-mandatory scrollbar-thin md:grid md:grid-cols-3 md:overflow-visible xl:grid-cols-6 min-w-0 max-w-full',
  card:
    'group relative sq-card sq-glass rounded-xl border border-border/50 bg-background/25 text-left w-[10.75rem] sm:w-full min-h-[4.75rem] snap-start shrink-0 sm:shrink border-l-[3px]',
  cardInner: 'flex flex-col gap-1.5 p-3 sm:p-3.5 h-full min-h-[4.75rem]',
  cardTopRow: 'flex items-center justify-between gap-2',
  cardLabel: 'text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/90',
  cardHeadline:
    'text-[13px] font-semibold tracking-[-0.02em] text-foreground leading-tight line-clamp-2 font-display',
  cardSubline: 'text-[11px] text-muted-foreground/90 leading-snug line-clamp-1',
  iconWrap:
    'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border border-border/45 bg-muted/15 text-muted-foreground',
  statusPill:
    'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.04em] border border-border/45 bg-background/50 text-muted-foreground',
  statusDot: 'w-1.5 h-1.5 rounded-full shrink-0',
  chip:
    'inline-flex items-center max-w-[11rem] truncate rounded-md px-2 py-1 text-[10px] font-medium border border-border/50 bg-background/40 text-foreground/85',
  readinessTitle:
    'text-[15px] sm:text-[16px] font-semibold tracking-[-0.025em] text-foreground font-display truncate',
  readinessSubtitle: 'text-[12px] text-muted-foreground leading-snug mt-0.5 line-clamp-1',
  readinessBadge:
    'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] border shrink-0',
  focusRing:
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  hover:
    'transition-[transform,box-shadow,border-color,background-color] duration-[var(--dur-fast)] motion-reduce:transition-none hover:border-border/80 hover:bg-background/40 hover:shadow-[var(--shadow-1)] hover:-translate-y-px motion-reduce:hover:translate-y-0',
  active:
    'active:translate-y-0 active:scale-[0.992] active:shadow-[var(--shadow-xs)] motion-reduce:active:scale-100',
} as const;

const CARD_ICONS: Record<VehicleOverviewQuickCardId, string> = {
  trips: 'route',
  bookings: 'calendar-clock',
  tasks: 'clipboard-list',
  damages: 'shield-alert',
  documents: 'file-text',
};

export function overviewCardIcon(id: VehicleOverviewQuickCardId): string {
  return CARD_ICONS[id];
}

export function cardStatusShortLabel(status: VehicleOverviewCardStatus): string {
  switch (status) {
    case 'clear':
      return 'Clear';
    case 'attention':
      return 'Watch';
    case 'critical':
      return 'Critical';
    case 'active':
      return 'Live';
    case 'neutral':
    default:
      return 'Idle';
  }
}

export function cardStatusAccentBorder(status: VehicleOverviewCardStatus): string {
  switch (status) {
    case 'clear':
      return 'border-l-[color:var(--status-positive)]/55';
    case 'attention':
      return 'border-l-[color:var(--status-attention)]/65';
    case 'critical':
      return 'border-l-[color:var(--status-critical)]/75';
    case 'active':
      return 'border-l-[color:var(--brand)]/55';
    case 'neutral':
    default:
      return 'border-l-border/70';
  }
}

export function cardStatusDotClass(status: VehicleOverviewCardStatus): string {
  switch (status) {
    case 'clear':
      return 'bg-[color:var(--status-positive)]';
    case 'attention':
      return 'bg-[color:var(--status-attention)]';
    case 'critical':
      return 'bg-[color:var(--status-critical)]';
    case 'active':
      return 'bg-[color:var(--brand)]';
    case 'neutral':
    default:
      return 'bg-muted-foreground/55';
  }
}

export function cardStatusPillClass(status: VehicleOverviewCardStatus): string {
  switch (status) {
    case 'clear':
      return 'text-[color:var(--status-positive)] border-[color:var(--status-positive)]/20 bg-[color:var(--status-positive-soft)]/25';
    case 'attention':
      return 'text-[color:var(--status-attention)] border-[color:var(--status-attention)]/25 bg-[color:var(--status-attention-soft)]/20';
    case 'critical':
      return 'text-[color:var(--status-critical)] border-[color:var(--status-critical)]/25 bg-[color:var(--status-critical-soft)]/20';
    case 'active':
      return 'text-[color:var(--brand)] border-[color:var(--brand)]/20 bg-[color:var(--brand)]/8';
    case 'neutral':
    default:
      return '';
  }
}

export function readinessToneClass(tone: VehicleOverviewReadinessTone): {
  surface: string;
  icon: string;
  dot: string;
  badge: string;
} {
  switch (tone) {
    case 'clear':
      return {
        surface: 'border-[color:var(--status-positive)]/18 bg-[color:var(--status-positive-soft)]/28',
        icon: 'sq-tone-success border-[color:var(--status-positive)]/15',
        dot: 'bg-[color:var(--status-positive)]',
        badge:
          'text-[color:var(--status-positive)] border-[color:var(--status-positive)]/22 bg-[color:var(--status-positive-soft)]/30',
      };
    case 'attention':
      return {
        surface: 'border-[color:var(--status-attention)]/22 bg-[color:var(--status-attention-soft)]/22',
        icon: 'sq-tone-warning border-[color:var(--status-attention)]/18',
        dot: 'bg-[color:var(--status-attention)]',
        badge:
          'text-[color:var(--status-attention)] border-[color:var(--status-attention)]/25 bg-[color:var(--status-attention-soft)]/25',
      };
    case 'critical':
      return {
        surface: 'border-[color:var(--status-critical)]/22 bg-[color:var(--status-critical-soft)]/22',
        icon: 'sq-tone-critical border-[color:var(--status-critical)]/18',
        dot: 'bg-[color:var(--status-critical)]',
        badge:
          'text-[color:var(--status-critical)] border-[color:var(--status-critical)]/25 bg-[color:var(--status-critical-soft)]/25',
      };
    case 'neutral':
    default:
      return {
        surface: 'border-border/50 bg-muted/8',
        icon: 'sq-tone-neutral border-border/45',
        dot: 'bg-muted-foreground/55',
        badge: 'text-muted-foreground border-border/55 bg-muted/15',
      };
  }
}

export function readinessDisplayTitle(
  readinessStatus: 'ready' | 'attention' | 'blocked' | 'unknown',
  title: string,
): string {
  if (readinessStatus === 'unknown' && title.toLowerCase().includes('checking')) {
    return title;
  }
  if (readinessStatus === 'unknown') return 'Status unknown';
  return title;
}

export function readinessStatusBadgeLabel(
  readinessStatus: 'ready' | 'attention' | 'blocked' | 'unknown',
): string {
  switch (readinessStatus) {
    case 'ready':
      return 'Ready';
    case 'attention':
      return 'Attention';
    case 'blocked':
      return 'Blocked';
    case 'unknown':
    default:
      return 'Unknown';
  }
}

export function readinessIconName(
  readinessStatus: 'ready' | 'attention' | 'blocked' | 'unknown',
): string {
  switch (readinessStatus) {
    case 'ready':
      return 'shield-check';
    case 'attention':
      return 'alert-triangle';
    case 'blocked':
      return 'shield-alert';
    case 'unknown':
    default:
      return 'help-circle';
  }
}
