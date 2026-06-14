import type { ReactNode } from 'react';
import { cn } from '../ui/utils';
import { HealthStatusChip, StatusDot } from './status';
import type { HealthState, StatusTone } from './status-utils';

/* ════════════════════════════════════════════════════════════════════
   VehicleMiniCard — compact fleet-vehicle representation reused across
   pickers, search results, assignment lists and dashboards.
   ════════════════════════════════════════════════════════════════════ */

export interface VehicleMiniCardProps {
  plate: ReactNode;
  title: ReactNode;
  /** Make / model line or any secondary text. */
  subtitle?: ReactNode;
  /** Leading visual (brand logo, icon). */
  leading?: ReactNode;
  /** Operational status (Available / Rented …) as a tone + label. */
  statusTone?: StatusTone;
  statusLabel?: ReactNode;
  /** Health pill on the right. */
  health?: HealthState | string;
  location?: ReactNode;
  lastSeen?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export function VehicleMiniCard({
  plate,
  title,
  subtitle,
  leading,
  statusTone,
  statusLabel,
  health,
  location,
  lastSeen,
  selected,
  onClick,
  className,
}: VehicleMiniCardProps) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-all duration-200',
        selected
          ? 'border-[color:var(--brand-soft)] bg-[color:var(--brand-soft)] ring-1 ring-[color:var(--brand-soft)]'
          : 'border-border bg-card hover:border-border hover:bg-muted/60',
        onClick && 'sq-press cursor-pointer',
        className,
      )}
    >
      {leading && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50">
          {leading}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-semibold text-foreground">{title}</span>
          {statusLabel && statusTone && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <StatusDot tone={statusTone} />
              {statusLabel}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <span className="font-mono font-semibold tabular-nums text-foreground/80">{plate}</span>
          {subtitle && (
            <>
              <span aria-hidden className="text-muted-foreground/50">·</span>
              <span className="truncate">{subtitle}</span>
            </>
          )}
        </div>
        {(location || lastSeen) && (
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
            {location && <span className="truncate">{location}</span>}
            {location && lastSeen && <span aria-hidden className="text-muted-foreground/40">·</span>}
            {lastSeen && <span className="shrink-0 tabular-nums">{lastSeen}</span>}
          </div>
        )}
      </div>
      {health != null && <HealthStatusChip state={health} className="shrink-0" />}
    </Wrapper>
  );
}
