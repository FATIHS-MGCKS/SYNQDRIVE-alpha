import { useMemo } from 'react';
import { ListTodo } from 'lucide-react';
import { ErrorState } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type { DashboardViewModel } from './dashboardTypes';
import type { DashboardOpenTasksOptions } from './dashboardTypes';
import { useDashboardTasksOverview } from './useDashboardTasksOverview';
import { buildFleetVehicleById } from './dashboardTasksOverview.utils';
import { useRentalOrg } from '../../RentalContext';
import { NotificationCardSkeleton } from './notifications/NotificationCardSkeleton';
import { NOTIFICATION_PANEL_TYPO } from './notifications/notificationPanelTypography';
import { panelShellClass } from './dashboardShell';
import { DashboardPanelScrollBlur } from './DashboardPanelScrollBlur';
import { TaskPreviewCard } from './tasks/TaskPreviewCard';
import { TasksOverviewHeader } from './tasks/TasksOverviewHeader';

interface DashboardTasksOverviewPanelProps {
  vm: DashboardViewModel;
  onOpenTasks?: (options?: DashboardOpenTasksOptions) => void;
}

export function DashboardTasksOverviewPanel({ vm, onOpenTasks }: DashboardTasksOverviewPanelProps) {
  const { orgId, userRole, hasPermission } = useRentalOrg();
  const canReadTasks = hasPermission('tasks', 'read');

  const overview = useDashboardTasksOverview({
    orgId,
    selectedStationId: vm.selectedStationId,
    fleetVehicles: vm.fleetVehicles,
    userRole,
    hasPermission,
    enabled: canReadTasks,
  });

  const vehicleById = useMemo(
    () => buildFleetVehicleById(vm.fleetVehicles),
    [vm.fleetVehicles],
  );

  if (!canReadTasks) {
    return null;
  }

  const { t, locale } = vm;
  const intlLocale = locale === 'de' ? 'de-DE' : locale;

  const openCount =
    overview.countsLoading || overview.error || !overview.counts
      ? null
      : overview.counts.open;

  const handleOpenTask = (taskId: string) => {
    onOpenTasks?.({ taskId });
  };

  return (
    <section
      className={cn(
        panelShellClass('tertiary'),
        'flex min-w-0 flex-col overflow-hidden animate-fade-up',
        'max-lg:max-h-[min(320px,42vh)]',
      )}
      aria-label={t('dashboardTasksOverview.title')}
      data-testid="dashboard-tasks-overview-panel"
    >
      <TasksOverviewHeader
        title={t('dashboardTasksOverview.title')}
        openCount={openCount}
        countsLoading={overview.countsLoading}
        counts={overview.counts}
        canViewUnassigned={overview.canViewUnassigned}
        showMetrics={!overview.error && Boolean(overview.counts)}
        t={t}
        onOpenAllTasks={onOpenTasks ? () => onOpenTasks() : undefined}
        onFilterSelect={onOpenTasks ? (filter) => onOpenTasks({ filter }) : undefined}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {overview.error ? (
          <div className="px-3.5 py-4">
            <ErrorState
              title={t('dashboardTasksOverview.error')}
              retryLabel={t('dashboardTasksOverview.retry')}
              onRetry={() => void overview.reload()}
              compact
            />
          </div>
        ) : overview.previewLoading ? (
          <div data-testid="dashboard-tasks-overview-preview-loading" className="px-2 py-2">
            <NotificationCardSkeleton rows={3} />
          </div>
        ) : overview.previewReady && overview.counts && overview.counts.open === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl sq-tone-success"
              aria-hidden
            >
              <ListTodo className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className={NOTIFICATION_PANEL_TYPO.emptyTitle}>{t('dashboardTasksOverview.emptyTitle')}</p>
              <p className={NOTIFICATION_PANEL_TYPO.emptyBody}>{t('dashboardTasksOverview.emptyDescription')}</p>
            </div>
          </div>
        ) : overview.previewReady ? (
          <DashboardPanelScrollBlur className="flex-1">
            <ul
              className="flex flex-col gap-2 px-2 py-2 sm:px-2.5"
              role="list"
              data-testid="dashboard-tasks-overview-preview"
            >
              {overview.previewTasks.map((task) => (
                <li key={task.id} className="list-none">
                  <TaskPreviewCard
                    task={task}
                    vehicleById={vehicleById}
                    t={t}
                    locale={intlLocale}
                    onOpenTask={handleOpenTask}
                  />
                </li>
              ))}
            </ul>
          </DashboardPanelScrollBlur>
        ) : null}
      </div>
    </section>
  );
}
