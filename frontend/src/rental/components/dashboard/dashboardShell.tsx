import type { ReactNode } from 'react';
import { cn } from '../../../components/ui/utils';

/** Shared layout rhythm for the Control Center dashboard. */
export const DASHBOARD_LAYOUT = {
  shell: 'mx-auto w-full max-w-[1600px] space-y-5',
  focusShell: 'mx-auto w-full max-w-[1400px] space-y-4',
  opsStack: 'space-y-3',
  focusStack: 'space-y-4',
  opsGrid: 'grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start',
  signalsGrid: 'grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-stretch',
  financeZone: 'border-t border-border/50 pt-5',
} as const;

export type DashboardPanelTier = 'primary' | 'secondary' | 'tertiary';

export function panelShellClass(tier: DashboardPanelTier, className?: string): string {
  return cn(
    'flex flex-col overflow-hidden rounded-2xl',
    tier === 'primary' && 'sq-card shadow-[var(--shadow-sm)] ring-1 ring-border/40',
    tier === 'secondary' && 'sq-card shadow-[var(--shadow-xs)]',
    tier === 'tertiary' &&
      'rounded-xl border border-dashed border-border/55 bg-muted/[0.35] dark:bg-muted/10',
    className,
  );
}

export const PANEL_HEADER_CLASS = 'border-b border-border/50 px-4 py-3';
export const PANEL_BODY_CLASS = 'px-4 py-3';
export const PANEL_BODY_SCROLL_CLASS = 'max-h-[min(520px,70vh)] flex-1 overflow-y-auto px-4 py-3';

export const INTERACTIVE_TAB_CLASS =
  'shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export const INTERACTIVE_ROW_CLASS =
  'transition-colors duration-150 focus-within:bg-muted/20';

export function DashboardSectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn('sq-section-label px-0.5 text-[10px] font-semibold uppercase tracking-widest', className)}>
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
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
            iconToneClass,
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold leading-tight tracking-[-0.01em] text-foreground">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 truncate text-[11px] leading-snug text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}

export const ACTION_QUEUE_LIST_CAP = 25;
