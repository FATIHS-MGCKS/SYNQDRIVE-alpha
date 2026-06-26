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
  /** `numeric` for counts/currency/percent; `text` for status phrases and durations. */
  valueVariant?: 'numeric' | 'text';
  className?: string;
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
  className,
}: VehicleBookingSummaryCardProps) {
  if (loading) {
    return (
      <div className={cn('sq-card flex h-full flex-col p-3.5 sm:p-4', className)}>
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-4 rounded-md" />
        </div>
        <Skeleton className="mt-2.5 h-6 w-28" />
        <Skeleton className="mt-2 h-3 w-36" />
      </div>
    );
  }

  return (
    <div className={cn('sq-card flex h-full min-h-0 flex-col p-3.5 sm:p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {status ? <StatusDot tone={status} /> : null}
          <span className="truncate text-[12px] font-semibold text-muted-foreground sm:text-[13px]">
            {label}
          </span>
        </div>
        {icon ? <span className="shrink-0 text-muted-foreground/80">{icon}</span> : null}
      </div>

      <div className="mt-2 flex min-w-0 flex-1 flex-col justify-center">
        {valueVariant === 'numeric' ? (
          <div className="flex min-w-0 items-baseline gap-1">
            <span className="truncate font-mono text-[22px] font-bold leading-none tabular-nums tracking-tight text-foreground sm:text-[24px] lg:text-[28px]">
              {value}
            </span>
            {unit ? (
              <span className="shrink-0 text-[12px] font-semibold text-muted-foreground">{unit}</span>
            ) : null}
          </div>
        ) : (
          <p className="text-[16px] font-semibold leading-[1.25] text-foreground sm:text-[17px] lg:text-[18px]">
            {value}
          </p>
        )}
      </div>

      {hint ? (
        <p className="mt-1.5 text-[12px] leading-[1.35] text-muted-foreground sm:text-[13px]">{hint}</p>
      ) : null}
    </div>
  );
}
