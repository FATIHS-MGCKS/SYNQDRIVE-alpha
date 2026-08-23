import { Skeleton } from '../../../../components/ui/skeleton';
import { cn } from '../../../../components/ui/utils';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useRentalOrg } from '../../../RentalContext';
import type { DashboardViewModel } from '../dashboardTypes';
import { panelShellClass } from '../dashboardShell';
import { NOTIFICATION_PANEL_TYPO } from '../notifications/notificationPanelTypography';
import { UtilizationHeatmapLegend } from './UtilizationHeatmapLegend';
import { UtilizationKpiRow } from './UtilizationKpiRow';
import { UtilizationMonthCalendar } from './UtilizationMonthCalendar';
import { useDashboardUtilization } from './useDashboardUtilization';

interface DashboardUtilizationPanelProps {
  vm: DashboardViewModel;
  className?: string;
}

export function DashboardUtilizationPanel({ vm, className }: DashboardUtilizationPanelProps) {
  const { t } = useLanguage();
  const { orgId } = useRentalOrg();
  const { month, phase, data, error } = useDashboardUtilization(orgId, vm.selectedStationId);

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
        panelShellClass('tertiary'),
        'flex min-h-[172px] min-w-0 flex-col overflow-hidden px-3 py-3.5 lg:h-full lg:px-3 lg:py-2.5',
        className,
      )}
      aria-label={t('dashboard.utilization.title')}
    >
      {loading ? (
        <div
          className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-2"
          aria-busy="true"
        >
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-24 rounded-md" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-12 rounded-lg" />
              <Skeleton className="h-12 rounded-lg" />
            </div>
          </div>
          <Skeleton className="min-h-[140px] rounded-xl lg:min-h-0 lg:h-full" />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-stretch lg:gap-2">
          <div className="flex min-h-0 min-w-0 flex-col gap-3 lg:gap-2.5">
            <h2 className={cn(NOTIFICATION_PANEL_TYPO.boxTitle, 'shrink-0')}>
              {t('dashboard.utilization.title')}
            </h2>

            {hasError ? (
              <p className="text-[10px] text-muted-foreground">{t('dashboard.utilization.loadingError')}</p>
            ) : null}

            <UtilizationKpiRow
              layout="stack"
              utilizationLabel={t('dashboard.utilization.monthUtilization')}
              bookingsLabel={t('dashboard.utilization.monthBookings')}
              vsPreviousMonthLabel={t('dashboard.utilization.vsPreviousMonth')}
              utilizationPercent={metrics.utilizationPercent}
              utilizationDeltaPp={metrics.utilizationDeltaPp}
              bookingCount={metrics.bookingCount}
              bookingDeltaPercent={metrics.bookingDeltaPercent}
            />

            <UtilizationHeatmapLegend
              className="mt-auto hidden lg:block"
              label={t('dashboard.utilization.legendLabel')}
              ticks={['0%', '20%', '40%', '60%', '80%', '100%']}
            />
          </div>

          <div className="flex min-h-[140px] min-w-0 lg:min-h-0 lg:h-full">
            <UtilizationMonthCalendar
              fillHeight
              className="h-full w-full"
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
          </div>

          <UtilizationHeatmapLegend
            className="lg:hidden"
            label={t('dashboard.utilization.legendLabel')}
            ticks={['0%', '20%', '40%', '60%', '80%', '100%']}
          />
        </div>
      )}
    </section>
  );
}
