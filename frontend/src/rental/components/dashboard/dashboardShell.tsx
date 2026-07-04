import type { ReactNode } from 'react';
import { cn } from '../../../components/ui/utils';

/** Shared layout rhythm for the Control Center dashboard.
 *  Spacing is intentionally generous so each zone reads as its own block
 *  instead of one dense wall of data. */
export const DASHBOARD_LAYOUT = {
  shell: 'mx-auto w-full max-w-[1600px] space-y-5 lg:space-y-7',
  focusShell: 'mx-auto w-full max-w-[1400px] space-y-5',
  opsStack: 'space-y-3.5',
  focusStack: 'space-y-4',
  opsGrid: 'grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)] lg:items-stretch',
  /**
   * Desktop row 1: Control KPIs (left) + Finances / Business Pulse (right).
   * Mobile: KPIs, then Finances (stacked).
   */
  controlFinanceGrid:
    'grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start lg:gap-4 xl:gap-5',
  controlKpiSlot: 'min-w-0 w-full',
  financeSlot: 'min-w-0 w-full',
  controlKpiShell:
    'rounded-2xl border border-border/55 bg-card/60 px-4 py-4 shadow-none sm:p-5',
  /**
   * Desktop row 2: Notifications (left) + Day Plan (right).
   * Mobile: Notifications, then Day Plan (stacked).
   */
  notificationsDayPlanGrid:
    'grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start lg:gap-4 xl:gap-5',
  notificationsSlot: 'min-w-0 w-full',
  dayPlanSlot: 'min-w-0 w-full',
  financeZone: 'border-t border-border/50 pt-7',
} as const;

export type DashboardPanelTier = 'primary' | 'secondary' | 'tertiary';

export function panelShellClass(tier: DashboardPanelTier, className?: string): string {
  return cn(
    'flex flex-col overflow-hidden rounded-2xl',
    tier === 'primary' && 'sq-card shadow-[var(--shadow-sm)] ring-1 ring-border/40',
    tier === 'secondary' && 'sq-card shadow-[var(--shadow-xs)]',
    tier === 'tertiary' && 'border border-border/55 bg-muted/[0.28] dark:bg-muted/[0.08]',
    className,
  );
}

export const PANEL_HEADER_CLASS = 'border-b border-border/50 px-4 py-3.5';
export const PANEL_BODY_CLASS = 'px-4 py-4';
export const PANEL_BODY_SCROLL_CLASS = 'max-h-[min(560px,72vh)] flex-1 overflow-y-auto px-4 py-4';

export const INTERACTIVE_TAB_CLASS =
  'shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export const INTERACTIVE_ROW_CLASS =
  'transition-colors duration-150 focus-within:bg-muted/20';

/* ── Shared dashboard typography scale ──
   Replaces the scattered `text-[8px]`–`text-[11px]` values across panels so
   every row obeys the same readable rhythm. Content never drops below 12px;
   11px is reserved for genuine micro-labels (uppercase, tracked). */

/** Primary row title — the one element the eye should land on per row. */
export const ROW_TITLE_CLASS =
  'text-[14px] font-semibold leading-snug tracking-[-0.01em] text-foreground text-pretty';

/** Secondary supporting line (reason, customer, explanation). */
export const ROW_BODY_CLASS = 'text-[12.5px] leading-relaxed text-muted-foreground text-pretty';

/** Captions / metadata (station, time, counts). */
export const META_TEXT_CLASS = 'text-[12px] leading-normal text-muted-foreground';

/** Micro-label — uppercase tracked, used sparingly for category/section tags. */
export const MICRO_LABEL_CLASS =
  'text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';

export function DashboardSectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn('sq-section-label px-0.5 text-[11px] font-semibold uppercase tracking-widest', className)}>
      {children}
    </p>
  );
}

export function DashboardPanelHeader({
  icon,
  iconToneClass = 'sq-tone-neutral bg-muted/50',
  title,
  subtitle,
  trailing,
}: {
  icon: ReactNode;
  iconToneClass?: string;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className={cn(PANEL_HEADER_CLASS, 'flex items-start justify-between gap-3')}>
      <div className="flex min-w-0 items-center gap-2.5">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
            iconToneClass,
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-tight tracking-[-0.01em] text-foreground text-balance">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 truncate text-[12px] leading-snug text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}

export const ACTION_QUEUE_LIST_CAP = 25;

/** Shared compact KPI typography (Control Center strip + Business Pulse). */
export const DASHBOARD_KPI_TITLE_CLASS =
  'min-w-0 truncate text-[10.5px] font-medium tracking-[-0.01em] text-muted-foreground';
export const DASHBOARD_KPI_NUMBER_CLASS =
  'text-[21px] font-semibold tabular-nums leading-none tracking-[-0.03em]';
export const DASHBOARD_KPI_HINT_CLASS = 'text-[10px] leading-snug text-muted-foreground';

export function dashboardPanelHeaderClass(): string {
  return 'flex shrink-0 items-center justify-between gap-2 border-b border-border/35 px-3.5 py-2.5';
}
