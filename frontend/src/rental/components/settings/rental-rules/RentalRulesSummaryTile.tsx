import type { ReactNode } from 'react';
import { StatusDot } from '../../../../components/patterns/status';
import type { StatusTone } from '../../../../components/patterns/status-utils';
import { cn } from '../../../../components/ui/utils';

export interface RentalRulesSummaryTileProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  status?: StatusTone;
  /** `numeric` for counts; `text` for phrases like "6 fields"; `status` for short labels. */
  valueVariant?: 'numeric' | 'text' | 'status';
  subdued?: boolean;
  className?: string;
}

const STATUS_VALUE_CLASS: Partial<Record<StatusTone, string>> = {
  success: 'text-[color:var(--status-positive)]',
  info: 'text-[color:var(--brand)]',
  watch: 'text-amber-600 dark:text-amber-400',
  warning: 'text-amber-600 dark:text-amber-400',
  critical: 'text-[color:var(--status-critical)]',
};

function valueClass(
  valueVariant: 'numeric' | 'text' | 'status',
  subdued: boolean,
): string {
  if (subdued) return 'booking-kpi-tile__value--subdued';
  if (valueVariant === 'numeric') return 'booking-kpi-tile__value--numeric';
  if (valueVariant === 'status') return 'booking-kpi-tile__value--status';
  return 'booking-kpi-tile__value--text';
}

export function RentalRulesSummaryTile({
  label,
  value,
  hint,
  icon,
  status,
  valueVariant = 'numeric',
  subdued = false,
  className,
}: RentalRulesSummaryTileProps) {
  const toneClass =
    !subdued && valueVariant === 'status' && status
      ? STATUS_VALUE_CLASS[status]
      : subdued
        ? 'text-muted-foreground'
        : 'text-foreground';

  const dotVisible = Boolean(status && !subdued && status !== 'neutral' && valueVariant !== 'text');

  return (
    <div className={cn('booking-kpi-tile booking-kpi-tile--dense min-w-0', className)}>
      <div className="flex items-center gap-1 min-w-0">
        {dotVisible ? <StatusDot tone={status!} className="shrink-0 scale-90" /> : null}
        <span className="booking-kpi-tile__label min-w-0 flex-1 truncate">{label}</span>
        {icon ? <span className="booking-kpi-tile__icon shrink-0 opacity-60">{icon}</span> : null}
      </div>
      <div className="booking-kpi-tile__value-row min-w-0">
        <p className={cn('booking-kpi-tile__value break-words', valueClass(valueVariant, subdued), toneClass)}>
          {value}
        </p>
      </div>
      {hint ? <p className="booking-kpi-tile__hint line-clamp-2">{hint}</p> : null}
    </div>
  );
}
