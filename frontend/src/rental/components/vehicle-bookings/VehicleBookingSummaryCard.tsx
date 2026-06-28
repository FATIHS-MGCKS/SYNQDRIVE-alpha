import type { ReactNode } from 'react';
import { Skeleton } from '../../../components/ui/skeleton';
import { StatusDot } from '../../../components/patterns/status';
import type { StatusTone } from '../../../components/patterns/status-utils';
import { cn } from '../../../components/ui/utils';

export interface VehicleBookingSummaryCardProps {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  icon?: ReactNode;
  status?: StatusTone;
  hint?: ReactNode;
  loading?: boolean;
  /** `numeric` for counts/currency/percent; `text` for durations/dates; `status` for short status phrases. */
  valueVariant?: 'numeric' | 'text' | 'status';
  /** Muted compact styling for empty/zero values (0 €, —, „Kein Pickup geplant“). */
  subdued?: boolean;
  className?: string;
}

const STATUS_VALUE_CLASS: Partial<Record<StatusTone, string>> = {
  success: 'text-[color:var(--status-positive)]',
  info: 'text-[color:var(--brand)]',
  watch: 'text-amber-600 dark:text-amber-400',
  critical: 'text-[color:var(--status-critical)]',
};

function valueVariantClass(
  valueVariant: 'numeric' | 'text' | 'status',
  subdued: boolean,
): string {
  if (subdued) return 'booking-kpi-tile__value--subdued';
  if (valueVariant === 'numeric') return 'booking-kpi-tile__value--numeric';
  if (valueVariant === 'status') return 'booking-kpi-tile__value--status';
  return 'booking-kpi-tile__value--text';
}

function showStatusDot(
  status: StatusTone | undefined,
  subdued: boolean,
  valueVariant: 'numeric' | 'text' | 'status',
): boolean {
  if (!status || subdued || status === 'neutral') return false;
  return valueVariant === 'status' || valueVariant === 'numeric';
}

export function VehicleBookingSummaryCard({
  label,
  value,
  unit,
  icon,
  status,
  hint,
  loading,
  valueVariant = 'text',
  subdued = false,
  className,
}: VehicleBookingSummaryCardProps) {
  if (loading) {
    return (
      <div className={cn('booking-kpi-tile booking-kpi-tile--dense', className)}>
        <div className="flex items-center justify-between gap-1.5">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-3 w-3 rounded" />
        </div>
        <Skeleton className="mt-1 h-3.5 w-20" />
        <Skeleton className="mt-0.5 h-2.5 w-28" />
      </div>
    );
  }

  const toneClass =
    !subdued && valueVariant === 'status' && status
      ? STATUS_VALUE_CLASS[status]
      : subdued
        ? 'text-muted-foreground'
        : 'text-foreground';

  const dotVisible = showStatusDot(status, subdued, valueVariant);

  return (
    <div className={cn('booking-kpi-tile booking-kpi-tile--dense min-w-0', className)}>
      <div className="flex items-center gap-1 min-w-0">
        {dotVisible ? <StatusDot tone={status!} className="shrink-0 scale-90" /> : null}
        <span className="booking-kpi-tile__label min-w-0 flex-1 truncate">{label}</span>
        {icon ? (
          <span className="booking-kpi-tile__icon shrink-0 opacity-60">{icon}</span>
        ) : null}
      </div>

      <div className="booking-kpi-tile__value-row min-w-0">
        {valueVariant === 'numeric' ? (
          <div className="flex min-w-0 items-baseline gap-0.5">
            <span
              className={cn(
                'booking-kpi-tile__value tabular-nums',
                valueVariantClass(valueVariant, subdued),
                toneClass,
              )}
            >
              {value}
            </span>
            {unit ? (
              <span className="booking-kpi-tile__unit text-muted-foreground">{unit}</span>
            ) : null}
          </div>
        ) : (
          <p
            className={cn(
              'booking-kpi-tile__value break-words',
              valueVariantClass(valueVariant, subdued),
              toneClass,
            )}
          >
            {value}
          </p>
        )}
      </div>

      {hint ? <p className="booking-kpi-tile__hint line-clamp-2">{hint}</p> : null}
    </div>
  );
}
