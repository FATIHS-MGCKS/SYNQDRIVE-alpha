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
import {
  DashboardPanelHeader,
  INTERACTIVE_ROW_CLASS,
  META_TEXT_CLASS,
  ROW_BODY_CLASS,
  ROW_TITLE_CLASS,
  panelShellClass,
} from './dashboardShell';
import type { DashboardViewModel } from './dashboardTypes';
import { useDashboardTasksOverview } from './useDashboardTasksOverview';
import { buildFleetVehicleById, isTaskDueToday } from './dashboardTasksOverview.utils';
import { useRentalOrg } from '../../RentalContext';

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
        'inline-flex items-center gap-1 rounded-lg border border-border/45 bg-muted/20 px-2 py-1 text-[11px] font-medium tabular-nums text-muted-foreground',
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
    <div className={cn(INTERACTIVE_ROW_CLASS, 'border-b border-border/30 px-3.5 py-2.5 last:border-b-0')}>
      <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn(ROW_TITLE_CLASS, 'truncate')}>{task.title?.trim() || '—'}</p>
          <p className={cn(ROW_BODY_CLASS, 'mt-0.5 truncate')}>
            {linked.primary}
            {linked.secondary ? ` · ${linked.secondary}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 sm:justify-end">
          <span
            className={cn(
              META_TEXT_CLASS,
              deriveTaskIsOverdue(task) && 'font-medium text-[color:var(--status-critical)]',
              isTaskDueToday(task) && !deriveTaskIsOverdue(task) && 'font-medium text-[color:var(--status-watch)]',
            )}
          >
            {formatTaskDueLabel(task, t, locale)}
          </span>
          {showPriority ? (
            <span className={cn(META_TEXT_CLASS, 'font-semibold uppercase tracking-wide')}>
              {task.priority === 'CRITICAL'
                ? t('dashboardTasksOverview.priorityCritical')
                : t('dashboardTasksOverview.priorityHigh')}
            </span>
          ) : null}
          <span className={META_TEXT_CLASS}>{assignee}</span>
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
    overview.loading || overview.error || !overview.counts
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
      <DashboardPanelHeader
        icon={<ListTodo className="h-4 w-4 text-[color:var(--brand)]" aria-hidden />}
        iconToneClass="sq-tone-brand bg-[color:var(--brand)]/10"
        title={t('dashboardTasksOverview.title')}
        subtitle={subtitle}
        trailing={
          onOpenTasks ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 px-2.5 text-[12px] font-semibold"
              onClick={onOpenTasks}
            >
              {t('dashboardTasksOverview.allTasks')}
            </Button>
          ) : null
        }
      />

      <div className="border-b border-border/35 px-3.5 py-2.5">
        {overview.loading ? (
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
        {overview.loading ? (
          <div className="px-3.5 py-3">
            <SkeletonRows rows={4} />
          </div>
        ) : overview.error ? (
          <div className="px-3.5 py-4">
            <ErrorState
              title={t('dashboardTasksOverview.error')}
              retryLabel={t('dashboardTasksOverview.retry')}
              onRetry={() => void overview.reload()}
              compact
            />
          </div>
        ) : overview.counts && overview.counts.open === 0 ? (
          <div className="px-3.5 py-6 text-center">
            <p className={ROW_TITLE_CLASS}>{t('dashboardTasksOverview.emptyTitle')}</p>
            <p className={cn(ROW_BODY_CLASS, 'mt-1')}>{t('dashboardTasksOverview.emptyDescription')}</p>
          </div>
        ) : (
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
        )}
      </div>
    </section>
  );
}
