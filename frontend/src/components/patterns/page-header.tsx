import type { ReactNode } from 'react';
import { cn } from '../ui/utils';

/* ════════════════════════════════════════════════════════════════════
   PageHeader — the consistent top-of-page block for every view.
   Replaces the dozens of bespoke `<h1 + actions>` rows across the app.
   Quiet by default; colour only enters via an optional `status` chip.
   ════════════════════════════════════════════════════════════════════ */

export interface PageHeaderProps {
  title: ReactNode;
  /** Small overline above the title (breadcrumb / category). */
  eyebrow?: ReactNode;
  description?: ReactNode;
  /** Right-aligned action cluster (buttons, menus). */
  actions?: ReactNode;
  /** Leading icon tile next to the title. */
  icon?: ReactNode;
  /** Inline status chip rendered next to the title. */
  status?: ReactNode;
  /** Compact meta row beneath the title (counts, last-updated, etc.). */
  meta?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  icon,
  status,
  meta,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'mb-4 flex flex-col gap-2.5 animate-fade-up sm:mb-5 sm:flex-row sm:items-start sm:justify-between sm:gap-4',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <div className="sq-section-label mb-1 truncate">{eyebrow}</div>
        )}
        <div className="flex min-w-0 items-center gap-2">
          {icon && (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sq-tone-brand">
              {icon}
            </span>
          )}
          <h1 className="min-w-0 truncate font-display text-[length:var(--text-display-lg)] font-bold leading-[1.15] tracking-[var(--tracking-display)] text-foreground">
            {title}
          </h1>
          {status}
        </div>
        {description && (
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
        {meta && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
            {meta}
          </div>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   SectionHeader — subsection title inside a page or card.
   ════════════════════════════════════════════════════════════════════ */

export interface SectionHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Render the title as the small uppercase tracked label instead of h2. */
  as?: 'heading' | 'label';
  className?: string;
}

export function SectionHeader({
  title,
  description,
  actions,
  as = 'heading',
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn('flex items-end justify-between gap-3 mb-3', className)}>
      <div className="min-w-0">
        {as === 'label' ? (
          <div className="sq-section-label">{title}</div>
        ) : (
          <h2 className="truncate text-foreground">{title}</h2>
        )}
        {description && (
          <p className="mt-0.5 text-[12px] text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
