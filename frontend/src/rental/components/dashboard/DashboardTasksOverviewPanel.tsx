import { useMemo } from 'react';
import { ListTodo } from 'lucide-react';
import { SkeletonRows, ErrorState } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../components/ui/utils';
import type { ApiTask } from '../../../lib/api';
import { deriveTaskIsOverdue } from '../../lib/task-display.utils';
import { resolvePrimaryLinkedObjectLabel } from '../../lib/task-list.utils';
import type { TranslationKey } from '../../i18n/translations/en';
import type { VehicleData } from '../../data/vehicles';
import { panelShellClass } from './dashboardShell';
import type { DashboardViewModel } from './dashboardTypes';
import { useDashboardTasksOverview } from './useDashboardTasksOverview';
import { buildFleetVehicleById, isTaskDueToday } from './dashboardTasksOverview.utils';
import { useRentalOrg } from '../../RentalContext';
import { NOTIFICATION_PANEL_TYPO } from './notifications/notificationPanelTypography';

interface DashboardTasksOverviewPanelProps {
  vm: DashboardViewModel;
  onOpenTasks?: () => void;
}

interface StatusChipProps {
  label: string;
  value: number;
  tone?: 'critical' | 'watch' | 'neutral';
}

function StatusChip({ label, value, tone = 'neutral' }: StatusChipProps) {
  return (
    <span
      className={cn(
        NOTIFICATION_PANEL_TYPO.metaBadge,
        'gap-1 border border-border/45 bg-muted/20 px-2 py-1 tabular-nums text-muted-foreground',
        tone === 'critical' && value > 0 && 'border-[color:var(--status-critical)]/25 text-[color:var(--status-critical)]',
        tone === 'watch' && value > 0 && 'border-[color:var(--status-watch)]/25 text-[color:var(--status-watch)]',
      )}
    >
      <span>{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </span>
  );
}

function formatTaskDueLabel(
  task: ApiTask,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
  locale: string,
): string {
  if (deriveTaskIsOverdue(task)) {
    return t('dashboardTasksOverview.dueOverdue');
  }
  if (isTaskDueToday(task)) {
    return t('dashboardTasksOverview.dueToday');
  }
  if (task.dueDate) {
    const due = new Date(task.dueDate);
    if (!Number.isNaN(due.getTime())) {
      return due.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
  }
  return t('dashboardTasksOverview.noDueDate');
}

function TaskPreviewRow({
  task,
  vehicleById,
  t,
  locale,
}: {
  task: ApiTask;
  vehicleById: Map<string, VehicleData>;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  locale: string;
}) {
  const vehicle = task.vehicleId ? vehicleById.get(task.vehicleId) : undefined;
  const linked = resolvePrimaryLinkedObjectLabel(task, vehicle
    ? { id: vehicle.id, license: vehicle.license, model: vehicle.model }
    : undefined);
  const assignee = task.assignedUserId
    ? task.assignedUserName?.trim() || t('dashboardTasksOverview.unassignedAssignee')
    : t('dashboardTasksOverview.unassignedAssignee');
  const showPriority =
    task.priority === 'CRITICAL' || task.priority === 'HIGH';

  return (
    <div className="border-b border-border/30 px-3 py-2.5 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn(NOTIFICATION_PANEL_TYPO.cardTitle, 'truncate')}>{task.title?.trim() || '—'}</p>
          <p className={cn(NOTIFICATION_PANEL_TYPO.entity, 'mt-0.5 truncate')}>
            {linked.primary}
            {linked.secondary ? ` · ${linked.secondary}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 sm:justify-end">
          <span
            className={cn(
              NOTIFICATION_PANEL_TYPO.meta,
              deriveTaskIsOverdue(task) && 'font-medium text-[color:var(--status-critical)]',
              isTaskDueToday(task) && !deriveTaskIsOverdue(task) && 'font-medium text-[color:var(--status-watch)]',
            )}
          >
            {formatTaskDueLabel(task, t, locale)}
          </span>
          {showPriority ? (
            <span className={cn(NOTIFICATION_PANEL_TYPO.metaBadge, 'bg-muted/30 uppercase')}>
              {task.priority === 'CRITICAL'
                ? t('dashboardTasksOverview.priorityCritical')
                : t('dashboardTasksOverview.priorityHigh')}
            </span>
          ) : null}
          <span className={NOTIFICATION_PANEL_TYPO.meta}>{assignee}</span>
        </div>
      </div>
    </div>
  );
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

  const subtitle =
    overview.countsLoading || overview.error || !overview.counts
      ? t('dashboardTasksOverview.subtitleLoading')
      : t('dashboardTasksOverview.subtitle', {
          openCount: overview.counts.open,
          todayCount: overview.counts.today,
        });

  return (
    <section
      className={cn(panelShellClass('secondary'), 'min-w-0 animate-fade-up')}
      aria-label={t('dashboardTasksOverview.title')}
      data-testid="dashboard-tasks-overview-panel"
    >
      <div className="shrink-0 border-b border-border/35 px-3.5 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color:var(--brand)]/10"
                aria-hidden
              >
                <ListTodo className="h-4 w-4 text-[color:var(--brand)]" />
              </span>
              <h2 className={NOTIFICATION_PANEL_TYPO.boxTitle}>{t('dashboardTasksOverview.title')}</h2>
            </div>
            <p className={cn(NOTIFICATION_PANEL_TYPO.meta, 'mt-0.5 text-muted-foreground')}>
              {subtitle}
            </p>
          </div>
          {onOpenTasks ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                NOTIFICATION_PANEL_TYPO.cta,
                'h-8 shrink-0 px-2.5 text-muted-foreground hover:text-foreground',
              )}
              onClick={onOpenTasks}
            >
              {t('dashboardTasksOverview.allTasks')}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="border-b border-border/35 px-3.5 py-2.5">
        {overview.countsLoading ? (
          <div className="flex flex-wrap gap-2" data-testid="dashboard-tasks-overview-loading">
            {Array.from({ length: 4 }).map((_, index) => (
              <span
                key={index}
                className="inline-block h-7 w-24 animate-pulse rounded-lg bg-muted/40"
              />
            ))}
          </div>
        ) : overview.error ? null : overview.counts ? (
          <div className="flex flex-wrap gap-2" data-testid="dashboard-tasks-overview-status-chips">
            <StatusChip
              label={t('dashboardTasksOverview.overdue')}
              value={overview.counts.overdue}
              tone="critical"
            />
            <StatusChip
              label={t('dashboardTasksOverview.today')}
              value={overview.counts.today}
              tone="watch"
            />
            <StatusChip
              label={t('dashboardTasksOverview.inProgress')}
              value={overview.counts.inProgress}
            />
            {overview.canViewUnassigned ? (
              <StatusChip
                label={t('dashboardTasksOverview.unassigned')}
                value={overview.counts.unassigned}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="min-w-0 px-0 py-0">
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
          <div className="px-3.5 py-3" data-testid="dashboard-tasks-overview-preview-loading">
            <SkeletonRows rows={4} />
          </div>
        ) : overview.previewReady && overview.counts && overview.counts.open === 0 ? (
          <div className="px-3.5 py-6 text-center">
            <p className={NOTIFICATION_PANEL_TYPO.emptyTitle}>{t('dashboardTasksOverview.emptyTitle')}</p>
            <p className={cn(NOTIFICATION_PANEL_TYPO.emptyBody, 'mt-1')}>{t('dashboardTasksOverview.emptyDescription')}</p>
          </div>
        ) : overview.previewReady ? (
          <div data-testid="dashboard-tasks-overview-preview">
            {overview.previewTasks.map((task) => (
              <TaskPreviewRow
                key={task.id}
                task={task}
                vehicleById={vehicleById}
                t={t}
                locale={intlLocale}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
