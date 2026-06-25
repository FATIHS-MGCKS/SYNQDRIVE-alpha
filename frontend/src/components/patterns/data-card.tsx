import type { ReactNode } from 'react';
import { cn } from '../ui/utils';
import { Skeleton } from '../ui/skeleton';
import type { StatusTone } from './status-utils';
import { StatusDot } from './status';

/* ════════════════════════════════════════════════════════════════════
   DataCard — the standard surface for a bounded block of content.
   Use a card ONLY when grouping/elevation communicates hierarchy; prefer
   dividers + spacing for plain data (see the brief's anti-card rule).
   ════════════════════════════════════════════════════════════════════ */

export interface DataCardProps {
  children: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  /** Header-right action cluster. */
  actions?: ReactNode;
  footer?: ReactNode;
  /** Lift slightly on hover (for clickable cards). */
  interactive?: boolean;
  /** Remove inner padding (e.g. when embedding a table flush to edges). */
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
  onClick?: () => void;
}

export function DataCard({
  children,
  title,
  description,
  actions,
  footer,
  interactive,
  flush,
  className,
  bodyClassName,
  onClick,
}: DataCardProps) {
  const hasHeader = title != null || actions != null || description != null;
  return (
    <div
      className={cn(
        interactive ? 'sq-card-elevated' : 'sq-card',
        'overflow-hidden',
        interactive && 'cursor-pointer',
        className,
      )}
      onClick={onClick}
    >
      {hasHeader && (
        <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3 border-b border-border/70">
          <div className="min-w-0">
            {title != null && <h3 className="truncate text-foreground">{title}</h3>}
            {description != null && (
              <p className="mt-0.5 text-[12px] text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(!flush && 'p-4', bodyClassName)}>{children}</div>
      {footer && (
        <div className="border-t border-border/70 px-4 py-3 text-[12px] text-muted-foreground">
          {footer}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   MetricCard — a single KPI. Number is monospace + tabular for a clean
   data feel. Trend and status are optional and semantic.
   ════════════════════════════════════════════════════════════════════ */

export interface MetricTrend {
  /** e.g. "+4.2%", "−3 vs. last week". */
  label: ReactNode;
  direction?: 'up' | 'down' | 'flat';
  /** When true, "up" is bad (e.g. overdue count rising) and flips colours. */
  invert?: boolean;
}

export interface MetricCardProps {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  icon?: ReactNode;
  trend?: MetricTrend;
  /** Tints the status dot in the header. */
  status?: StatusTone;
  hint?: ReactNode;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
  /** `numeric` = KPI numbers (default). `summary` = compact text lines, not hero-sized. */
  variant?: 'numeric' | 'summary';
  /** Numeric value scale — `compact` caps display size for dense summary grids. */
  valueSize?: 'default' | 'compact';
}

function trendToneClass(t: MetricTrend): string {
  const positive = t.invert ? t.direction === 'down' : t.direction === 'up';
  const negative = t.invert ? t.direction === 'up' : t.direction === 'down';
  if (positive) return 'text-[color:var(--status-positive)]';
  if (negative) return 'text-[color:var(--status-critical)]';
  return 'text-muted-foreground';
}

export function MetricCard({
  label,
  value,
  unit,
  icon,
  trend,
  status,
  hint,
  loading,
  onClick,
  className,
  variant = 'numeric',
  valueSize = 'default',
}: MetricCardProps) {
  if (loading) {
    return (
      <div className={cn('sq-card p-4', className)}>
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-5 w-5 rounded-md" />
        </div>
        <Skeleton className="mt-3 h-7 w-24" />
        <Skeleton className="mt-2 h-3 w-16" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        onClick ? 'sq-card-elevated cursor-pointer' : 'sq-card',
        'flex h-full flex-col p-3.5 sm:p-4',
        className,
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {status && <StatusDot tone={status} />}
          <span className="truncate text-[12px] font-medium text-muted-foreground">{label}</span>
        </div>
        {icon && <span className="shrink-0 text-muted-foreground/80">{icon}</span>}
      </div>
      <div className="mt-2 flex flex-1 flex-col justify-center">
        {variant === 'numeric' ? (
          <div className="flex items-baseline gap-1">
            <span
              className={cn(
                'font-mono font-bold tabular-nums tracking-tight text-foreground',
                valueSize === 'compact'
                  ? 'text-[24px] leading-none lg:text-[28px]'
                  : 'text-[22px] leading-none',
              )}
            >
              {value}
            </span>
            {unit && (
              <span className="text-[12px] font-medium text-muted-foreground">{unit}</span>
            )}
          </div>
        ) : (
          <span className="text-[13px] font-semibold leading-[1.3] text-foreground">{value}</span>
        )}
      </div>
      {(trend || hint) && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[12px]">
          {trend && (
            <span className={cn('font-semibold tabular-nums', trendToneClass(trend))}>
              {trend.direction === 'up' ? '↑ ' : trend.direction === 'down' ? '↓ ' : ''}
              {trend.label}
            </span>
          )}
          {hint && <span className="truncate text-muted-foreground">{hint}</span>}
        </div>
      )}
    </div>
  );
}
