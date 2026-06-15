import type { ReactNode } from 'react';
import { cn } from '../ui/utils';
import { Skeleton } from '../ui/skeleton';

/* ════════════════════════════════════════════════════════════════════
   EmptyState — calm, composed "nothing here yet" surface.
   Icon sits in a muted tile; one clear CTA at most. Not kitschy.
   ════════════════════════════════════════════════════════════════════ */

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Tighter padding for inline/in-card empties. */
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center animate-fade-up',
        compact ? 'py-8 px-4' : 'py-16 px-6',
        className,
      )}
    >
      {icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          {icon}
        </div>
      )}
      <p className="text-[14px] font-semibold text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   ErrorState — failed fetch / action surface with optional retry.
   Mirrors EmptyState layout; destructive tone on icon tile.
   ════════════════════════════════════════════════════════════════════ */

export interface ErrorStateProps {
  icon?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  /** Raw error message (shown when description omitted). */
  error?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
  className?: string;
}

export function ErrorState({
  icon,
  title = 'Something went wrong',
  description,
  error,
  onRetry,
  retryLabel = 'Try again',
  compact,
  className,
}: ErrorStateProps) {
  const detail = description ?? (error ? String(error) : undefined);

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center animate-fade-up',
        compact ? 'py-8 px-4' : 'py-16 px-6',
        className,
      )}
      role="alert"
    >
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl sq-tone-critical text-[color:var(--status-critical)]">
        {icon ?? (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        )}
      </div>
      <p className="text-[14px] font-semibold text-foreground">{title}</p>
      {detail && (
        <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">{detail}</p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Loading skeletons — shaped to the final layout (no generic spinners
   for primary surfaces, per the brief).
   ════════════════════════════════════════════════════════════════════ */

export interface SkeletonRowsProps {
  rows?: number;
  className?: string;
}

/** Vertical list of line rows — for tables/lists before data arrives. */
export function SkeletonRows({ rows = 5, className }: SkeletonRowsProps) {
  return (
    <div className={cn('space-y-2.5', className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${70 - (i % 3) * 12}%` }} />
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}

export interface SkeletonGridProps {
  count?: number;
  className?: string;
  cardClassName?: string;
}

/** Grid of metric-card-shaped skeletons. */
export function SkeletonMetricGrid({ count = 4, className, cardClassName }: SkeletonGridProps) {
  return (
    <div
      className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4', className)}
      aria-hidden
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn('sq-card p-4', cardClassName)}>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-24" />
          <Skeleton className="mt-2 h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

/** A single card-shaped skeleton block. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('sq-card p-4', className)} aria-hidden>
      <Skeleton className="h-4 w-32" />
      <div className="mt-4 space-y-2.5">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}
