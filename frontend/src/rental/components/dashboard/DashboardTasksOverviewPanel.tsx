import { useMemo } from 'react';
import { ListTodo } from 'lucide-react';
import { ErrorState } from '../../../components/patterns';
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
import { NotificationCardSkeleton } from './notifications/NotificationCardSkeleton';
import { NOTIFICATION_PANEL_TYPO } from './notifications/notificationPanelTypography';

interface DashboardTasksOverviewPanelProps {
  vm: DashboardViewModel;
  onOpenTasks?: () => void;
}

function severityBadgeTone(task: ApiTask): string {
  if (deriveTaskIsOverdue(task) || task.priority === 'CRITICAL') {
    return 'bg-[color:color-mix(in_srgb,var(--status-critical)_12%,transparent)] text-[color:var(--status-critical)]';
  }
  if (isTaskDueToday(task) || task.priority === 'HIGH') {
    return 'bg-[color:color-mix(in_srgb,var(--status-watch)_12%,transparent)] text-[color:var(--status-watch)]';
  }
  return 'bg-muted/60 text-muted-foreground';
}

function taskIconTone(task: ApiTask): string {
  if (deriveTaskIsOverdue(task) || task.priority === 'CRITICAL') return 'sq-tone-critical';
  if (isTaskDueToday(task) || task.priority === 'HIGH') return 'sq-tone-watch';
  return 'bg-muted/50 text-muted-foreground';
}

function taskEntrySurface(task: ApiTask): string {
  if (deriveTaskIsOverdue(task) || task.priority === 'CRITICAL') {
    return 'border-[color:color-mix(in_srgb,var(--status-critical)_22%,var(--border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--status-critical)_7%,transparent),transparent)]';
  }
  if (isTaskDueToday(task) || task.priority === 'HIGH') {
    return 'border-[color:color-mix(in_srgb,var(--status-watch)_20%,var(--border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--status-watch)_6%,transparent),transparent)]';
  }
  return 'border-border/30 bg-card/40';
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

function resolvePrimaryStatusLabel(
  task: ApiTask,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
): string | null {
  if (deriveTaskIsOverdue(task)) return t('dashboardTasksOverview.overdue');
  if (isTaskDueToday(task)) return t('dashboardTasksOverview.today');
  if (task.status === 'IN_PROGRESS') return t('dashboardTasksOverview.inProgress');
  if (!task.assignedUserId) return t('dashboardTasksOverview.unassigned');
  return null;
}

function TaskPreviewCard({
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
  const showPriority = task.priority === 'CRITICAL' || task.priority === 'HIGH';
  const primaryStatusLabel = resolvePrimaryStatusLabel(task, t);
  const entityLine = [linked.primary, linked.secondary].filter(Boolean).join(' · ');

  return (
    <article
      className={cn(
        'overflow-hidden rounded-xl border transition-colors motion-reduce:transition-none',
        taskEntrySurface(task),
      )}
    >
      <div className="px-3 py-2.5">
        <div className="flex w-full items-start gap-2.5 text-left">
          <div className="relative shrink-0" aria-hidden>
            <div className={cn(NOTIFICATION_PANEL_TYPO.iconWrap, taskIconTone(task))}>
              <ListTodo className={NOTIFICATION_PANEL_TYPO.icon} />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {primaryStatusLabel ? (
                  <span className={cn(NOTIFICATION_PANEL_TYPO.metaBadge, severityBadgeTone(task))}>
                    {primaryStatusLabel}
                  </span>
                ) : null}
                {showPriority ? (
                  <span className={cn(NOTIFICATION_PANEL_TYPO.metaBadge, 'bg-muted/60 uppercase text-muted-foreground')}>
                    {task.priority === 'CRITICAL'
                      ? t('dashboardTasksOverview.priorityCritical')
                      : t('dashboardTasksOverview.priorityHigh')}
                  </span>
                ) : null}
              </div>
              <span className={cn(NOTIFICATION_PANEL_TYPO.lastSeen, 'shrink-0 tabular-nums')}>
                {formatTaskDueLabel(task, t, locale)}
              </span>
            </div>

            <p className={cn(NOTIFICATION_PANEL_TYPO.cardTitle, 'mt-0.5')}>
              {task.title?.trim() || '—'}
            </p>

            {entityLine ? (
              <p className={cn(NOTIFICATION_PANEL_TYPO.description, 'mt-1 line-clamp-2')}>
                {entityLine}
              </p>
            ) : null}

            <p className={cn(NOTIFICATION_PANEL_TYPO.meta, 'mt-1 truncate')}>
              {assignee}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

function TasksOverviewCountsRow({
  counts,
  canViewUnassigned,
  t,
}: {
  counts: {
    overdue: number;
    today: number;
    inProgress: number;
    unassigned: number;
  };
  canViewUnassigned: boolean;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}) {
  const items = [
    {
      label: t('dashboardTasksOverview.overdue'),
      value: counts.overdue,
      tone: counts.overdue > 0 ? 'critical' as const : 'neutral' as const,
    },
    {
      label: t('dashboardTasksOverview.today'),
      value: counts.today,
      tone: counts.today > 0 ? 'watch' as const : 'neutral' as const,
    },
    {
      label: t('dashboardTasksOverview.inProgress'),
      value: counts.inProgress,
      tone: 'neutral' as const,
    },
    ...(canViewUnassigned
      ? [{
          label: t('dashboardTasksOverview.unassigned'),
          value: counts.unassigned,
          tone: 'neutral' as const,
        }]
      : []),
  ];

  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1"
      data-testid="dashboard-tasks-overview-status-chips"
    >
      {items.map((item) => (
        <span
          key={item.label}
          className={cn(
            NOTIFICATION_PANEL_TYPO.meta,
            'tabular-nums',
            item.tone === 'critical' && item.value > 0 && 'font-medium text-[color:var(--status-critical)]',
            item.tone === 'watch' && item.value > 0 && 'font-medium text-[color:var(--status-watch)]',
          )}
        >
          {item.label}
          {' '}
          <span className="font-semibold text-foreground">{item.value}</span>
        </span>
      ))}
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
      className={cn(panelShellClass('tertiary'), 'min-w-0 animate-fade-up')}
      aria-label={t('dashboardTasksOverview.title')}
      data-testid="dashboard-tasks-overview-panel"
    >
      <div className="shrink-0 border-b border-border/35 px-3.5 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 className={NOTIFICATION_PANEL_TYPO.boxTitle}>{t('dashboardTasksOverview.title')}</h2>
            <p className={cn(NOTIFICATION_PANEL_TYPO.meta, 'mt-0.5 text-muted-foreground')}>
              {subtitle}
            </p>
            {overview.countsLoading ? (
              <div className="mt-2 flex flex-wrap gap-2" data-testid="dashboard-tasks-overview-loading">
                {Array.from({ length: 4 }).map((_, index) => (
                  <span
                    key={index}
                    className="inline-block h-4 w-20 animate-pulse rounded-md bg-muted/40"
                  />
                ))}
              </div>
            ) : overview.error ? null : overview.counts ? (
              <TasksOverviewCountsRow
                counts={overview.counts}
                canViewUnassigned={overview.canViewUnassigned}
                t={t}
              />
            ) : null}
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

      <div className="min-h-0 flex-1">
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
          <div data-testid="dashboard-tasks-overview-preview-loading">
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
                />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
