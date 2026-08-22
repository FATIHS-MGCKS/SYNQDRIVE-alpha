import { Skeleton } from '../../../../components/ui/skeleton';
import { cn } from '../../../../components/ui/utils';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useRentalOrg } from '../../../RentalContext';
import type { DashboardViewModel } from '../dashboardTypes';
import { DASHBOARD_KPI_TITLE_CLASS } from '../dashboardShell';
import { UtilizationHeatmapLegend } from './UtilizationHeatmapLegend';
import { UtilizationKpiRow } from './UtilizationKpiRow';
import { UtilizationMonthCalendar } from './UtilizationMonthCalendar';
import { UtilizationMonthNav } from './UtilizationMonthNav';
import { UtilizationProgressBar } from './UtilizationProgressBar';
import { useDashboardUtilization } from './useDashboardUtilization';

interface DashboardUtilizationPanelProps {
  vm: DashboardViewModel;
  className?: string;
}

export function DashboardUtilizationPanel({ vm, className }: DashboardUtilizationPanelProps) {
  const { t, locale } = useLanguage();
  const { orgId } = useRentalOrg();
  const { month, phase, data, error, goToPreviousMonth, goToNextMonth } = useDashboardUtilization(
    orgId,
    vm.selectedStationId,
  );

  const monthLabel = new Date(Date.UTC(month.year, month.month - 1, 1)).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const weekdayLabels = [
    t('bookings.planner.weekdayMon'),
    t('bookings.planner.weekdayTue'),
    t('bookings.planner.weekdayWed'),
    t('bookings.planner.weekdayThu'),
    t('bookings.planner.weekdayFri'),
    t('bookings.planner.weekdaySat'),
    t('bookings.planner.weekdaySun'),
  ];

  const metrics = data?.monthMetrics ?? {
    utilizationPercent: null,
    bookingCount: 0,
    utilizationDeltaPp: null,
    bookingDeltaPercent: null,
  };

  const days =
    data?.days ??
    Array.from({ length: new Date(Date.UTC(month.year, month.month, 0)).getUTCDate() }, (_, index) => {
      const day = index + 1;
      return {
        date: `${month.year}-${String(month.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        utilizationPercent: null,
      };
    });

  const loading = phase === 'loading' || phase === 'idle';
  const hasError = phase === 'error' || Boolean(error);

  return (
    <section
      data-testid="dashboard-utilization-panel"
      className={cn(
        'surface-elevated flex min-h-[172px] min-w-0 flex-col rounded-2xl px-3 py-3.5',
        className,
      )}
      aria-label={t('dashboard.utilization.title')}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className={DASHBOARD_KPI_TITLE_CLASS}>
          {t('dashboard.utilization.title')}
        </h2>
        <UtilizationMonthNav
          label={monthLabel}
          onPrevious={goToPreviousMonth}
          onNext={goToNextMonth}
          previousLabel={t('dashboard.utilization.prevMonth')}
          nextLabel={t('dashboard.utilization.nextMonth')}
        />
      </div>

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-12 rounded-lg" />
            <Skeleton className="h-12 rounded-lg" />
          </div>
          <Skeleton className="h-2 rounded-full" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {hasError ? (
            <p className="text-[10px] text-muted-foreground">{t('dashboard.utilization.loadingError')}</p>
          ) : null}

          <UtilizationKpiRow
            utilizationLabel={t('dashboard.utilization.monthUtilization')}
            bookingsLabel={t('dashboard.utilization.monthBookings')}
            vsPreviousMonthLabel={t('dashboard.utilization.vsPreviousMonth')}
            utilizationPercent={metrics.utilizationPercent}
            utilizationDeltaPp={metrics.utilizationDeltaPp}
            bookingCount={metrics.bookingCount}
            bookingDeltaPercent={metrics.bookingDeltaPercent}
          />

          <UtilizationProgressBar
            label={t('dashboard.utilization.progressLabel')}
            percent={metrics.utilizationPercent}
          />

          <UtilizationMonthCalendar
            year={month.year}
            month={month.month}
            days={days}
            weekdayLabels={weekdayLabels}
            dayAriaLabel={(dateLabel, utilizationPercent) =>
              t('dashboard.utilization.dayAriaLabel', {
                date: dateLabel,
                percent:
                  utilizationPercent === null
                    ? t('dashboard.utilization.noData')
                    : String(Math.round(utilizationPercent)),
              })
            }
          />

          <UtilizationHeatmapLegend
            label={t('dashboard.utilization.legendLabel')}
            ticks={['0%', '20%', '40%', '60%', '80%', '100%']}
          />
        </div>
      )}
    </section>
  );
}
