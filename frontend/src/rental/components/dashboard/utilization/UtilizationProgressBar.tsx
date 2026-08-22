import { cn } from '../../../../components/ui/utils';
import { DASHBOARD_KPI_HINT_CLASS, DASHBOARD_KPI_TITLE_CLASS } from '../dashboardShell';
import { formatUtilizationPercent } from './utilizationHeatmapTone';

interface UtilizationProgressBarProps {
  label: string;
  percent: number | null;
  className?: string;
}

export function UtilizationProgressBar({ label, percent, className }: UtilizationProgressBarProps) {
  const safePercent = percent === null ? 0 : Math.max(0, Math.min(100, percent));

  return (
    <div className={cn('space-y-1 lg:space-y-0.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className={DASHBOARD_KPI_TITLE_CLASS}>{label}</p>
        <p className={cn(DASHBOARD_KPI_HINT_CLASS, 'font-semibold tabular-nums text-foreground')}>
          {formatUtilizationPercent(percent)}
        </p>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted/70 lg:h-1"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={safePercent}
        aria-label={`${label} ${formatUtilizationPercent(percent)}`}
      >
        <div
          className="h-full rounded-full bg-[color:var(--brand)] transition-all duration-300 motion-reduce:transition-none"
          style={{ width: `${safePercent}%` }}
        />
      </div>
    </div>
  );
}
