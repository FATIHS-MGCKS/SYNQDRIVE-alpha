import { cn } from '../../../../components/ui/utils';
import {
  DASHBOARD_KPI_HINT_CLASS,
  DASHBOARD_KPI_NUMBER_CLASS,
  DASHBOARD_KPI_TITLE_CLASS,
} from '../dashboardShell';
import {
  formatBookingDeltaPercent,
  formatUtilizationDeltaPp,
  formatUtilizationPercent,
} from './utilizationHeatmapTone';

interface UtilizationKpiRowProps {
  utilizationLabel: string;
  bookingsLabel: string;
  vsPreviousMonthLabel: string;
  utilizationPercent: number | null;
  utilizationDeltaPp: number | null;
  bookingCount: number;
  bookingDeltaPercent: number | null;
  layout?: 'row' | 'stack';
  className?: string;
}

export function UtilizationKpiRow({
  utilizationLabel,
  bookingsLabel,
  vsPreviousMonthLabel,
  utilizationPercent,
  utilizationDeltaPp,
  bookingCount,
  bookingDeltaPercent,
  layout = 'row',
  className,
}: UtilizationKpiRowProps) {
  const utilizationDelta = formatUtilizationDeltaPp(utilizationDeltaPp);
  const bookingDelta = formatBookingDeltaPercent(bookingDeltaPercent);

  const utilizationKpi = (
    <div className="min-w-0">
      <p className={DASHBOARD_KPI_TITLE_CLASS}>{utilizationLabel}</p>
      <p className={cn(DASHBOARD_KPI_NUMBER_CLASS, 'mt-1 lg:mt-0.5 lg:text-[17px]')}>
        {formatUtilizationPercent(utilizationPercent)}
      </p>
      {utilizationDelta ? (
        <p className={cn(DASHBOARD_KPI_HINT_CLASS, 'mt-0.5')}>
          {utilizationDelta} {vsPreviousMonthLabel}
        </p>
      ) : null}
    </div>
  );

  const bookingsKpi = (
    <div className="min-w-0">
      <p className={DASHBOARD_KPI_TITLE_CLASS}>{bookingsLabel}</p>
      <p className={cn(DASHBOARD_KPI_NUMBER_CLASS, 'mt-1 lg:mt-0.5 lg:text-[17px]')}>{bookingCount}</p>
      {bookingDelta ? (
        <p className={cn(DASHBOARD_KPI_HINT_CLASS, 'mt-0.5')}>
          {bookingDelta} {vsPreviousMonthLabel}
        </p>
      ) : null}
    </div>
  );

  if (layout === 'stack') {
    return (
      <div className={cn('flex min-w-0 flex-col gap-4 lg:gap-3', className)}>
        {utilizationKpi}
        {bookingsKpi}
      </div>
    );
  }

  return (
    <div className={cn('grid grid-cols-2 gap-3 lg:gap-2', className)}>
      {utilizationKpi}
      {bookingsKpi}
    </div>
  );
}
