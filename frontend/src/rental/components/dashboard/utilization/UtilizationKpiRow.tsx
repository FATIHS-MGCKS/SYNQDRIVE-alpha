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
}

export function UtilizationKpiRow({
  utilizationLabel,
  bookingsLabel,
  vsPreviousMonthLabel,
  utilizationPercent,
  utilizationDeltaPp,
  bookingCount,
  bookingDeltaPercent,
}: UtilizationKpiRowProps) {
  const utilizationDelta = formatUtilizationDeltaPp(utilizationDeltaPp);
  const bookingDelta = formatBookingDeltaPercent(bookingDeltaPercent);

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="min-w-0">
        <p className={DASHBOARD_KPI_TITLE_CLASS}>{utilizationLabel}</p>
        <p className={cn(DASHBOARD_KPI_NUMBER_CLASS, 'mt-1')}>
          {formatUtilizationPercent(utilizationPercent)}
        </p>
        {utilizationDelta ? (
          <p className={cn(DASHBOARD_KPI_HINT_CLASS, 'mt-0.5')}>
            {utilizationDelta} {vsPreviousMonthLabel}
          </p>
        ) : null}
      </div>
      <div className="min-w-0">
        <p className={DASHBOARD_KPI_TITLE_CLASS}>{bookingsLabel}</p>
        <p className={cn(DASHBOARD_KPI_NUMBER_CLASS, 'mt-1')}>{bookingCount}</p>
        {bookingDelta ? (
          <p className={cn(DASHBOARD_KPI_HINT_CLASS, 'mt-0.5')}>
            {bookingDelta} {vsPreviousMonthLabel}
          </p>
        ) : null}
      </div>
    </div>
  );
}
