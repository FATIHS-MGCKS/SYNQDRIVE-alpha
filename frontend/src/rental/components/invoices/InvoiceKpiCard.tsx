import type { LucideIcon } from 'lucide-react';

import { cn } from '../../../components/ui/utils';

export interface InvoiceKpiCardProps {
  label: string;
  value: string | number;
  helper: string;
  icon: LucideIcon;
  tone?: 'critical' | 'watch' | 'success' | 'info';
  subdued?: boolean;
  accent?: boolean;
  isActive?: boolean;
  onClick?: () => void;
}

export function InvoiceKpiCard({
  label,
  value,
  helper,
  icon: MetricIcon,
  tone,
  subdued = false,
  accent,
  isActive = false,
  onClick,
}: InvoiceKpiCardProps) {
  const hasAccent = accent ?? (typeof value === 'number' ? value > 0 : false);
  const isCritical = tone === 'critical' && hasAccent;
  const isWatch = tone === 'watch' && hasAccent;
  const isSuccess = tone === 'success' && hasAccent;
  const isInfo = tone === 'info' && hasAccent;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      aria-label={`${label}: ${value}`}
      className={cn(
        'sq-press group relative overflow-hidden border text-left transition-colors duration-200',
        'hover:border-border/60 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
        'min-h-[96px] rounded-lg surface-premium/55 px-2.5 py-2',
        isCritical && 'border-[color:var(--status-critical)]/35 bg-[color:var(--status-critical)]/[0.035]',
        isWatch && 'border-[color:var(--status-watch)]/30 surface-premium/55',
        isSuccess && 'border-[color:var(--status-positive)]/25 bg-[color:var(--status-positive)]/[0.025]',
        isInfo && 'border-border/45 surface-premium/55',
        !isCritical && !isWatch && !isSuccess && !isInfo && 'border-border/45',
        isActive && 'ring-2 ring-[color:var(--brand)]/55',
      )}
    >
      <div className="flex h-full items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10.5px] font-medium tracking-[-0.01em] text-muted-foreground">
            {label}
          </p>
          <p
            className={cn(
              'mt-1 truncate text-[21px] font-semibold tabular-nums leading-none tracking-[-0.03em]',
              subdued && 'text-muted-foreground',
              isCritical && 'text-[color:var(--status-critical)]',
              isSuccess && 'text-[color:var(--status-positive)]',
              isWatch && 'text-[color:var(--status-watch)]',
              isInfo && 'text-[color:var(--status-info)]',
              !subdued && !isCritical && !isSuccess && !isWatch && !isInfo && 'text-foreground',
            )}
          >
            {value}
          </p>
          <p className="mt-1 truncate text-[10px] leading-snug text-muted-foreground">{helper}</p>
        </div>
        <div
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
            isCritical && 'sq-tone-critical',
            isWatch && 'sq-tone-watch',
            isSuccess && 'sq-tone-success',
            isInfo && 'sq-tone-info',
            !isCritical && !isWatch && !isSuccess && !isInfo && 'bg-muted text-muted-foreground',
          )}
        >
          <MetricIcon className="h-3 w-3" />
        </div>
      </div>
      {isCritical ? (
        <span
          className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[color:var(--status-critical)]"
          aria-hidden
        />
      ) : null}
    </button>
  );
}
