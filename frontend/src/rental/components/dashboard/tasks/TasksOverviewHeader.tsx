import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../../../../components/ui/button';
import { cn } from '../../../../components/ui/utils';
import type { TranslationKey } from '../../../i18n/translations/en';
import { NOTIFICATION_PANEL_TYPO } from '../notifications/notificationPanelTypography';
import type { DashboardTasksOverviewFilter } from '../dashboardTypes';

interface TasksOverviewHeaderProps {
  title: string;
  openCount: number | null;
  countsLoading: boolean;
  counts: {
    open: number;
    overdue: number;
    today: number;
    inProgress: number;
    unassigned: number;
  } | null;
  canViewUnassigned: boolean;
  showMetrics: boolean;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  onOpenAllTasks?: () => void;
  onFilterSelect?: (filter: DashboardTasksOverviewFilter) => void;
}

function MetricCell({
  label,
  value,
  tone,
  onClick,
}: {
  label: ReactNode;
  value: number | string;
  tone?: 'critical' | 'watch' | 'neutral';
  onClick?: () => void;
}) {
  const content = (
    <>
      <span
        className={cn(
          NOTIFICATION_PANEL_TYPO.meta,
          'block text-center text-[10px] leading-3 text-muted-foreground min-[390px]:text-xs min-[390px]:leading-4',
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          NOTIFICATION_PANEL_TYPO.meta,
          'mt-0.5 block text-center text-base font-semibold tabular-nums leading-5 text-foreground',
          tone === 'critical' && typeof value === 'number' && value > 0 && 'text-[color:var(--status-critical)]',
          tone === 'watch' && typeof value === 'number' && value > 0 && 'text-[color:var(--status-watch)]',
        )}
      >
        {value}
      </span>
    </>
  );

  if (!onClick) {
    return <div className="min-w-0 px-0.5 sm:px-1">{content}</div>;
  }

  return (
    <button
      type="button"
      className="min-h-11 min-w-0 rounded-md px-0.5 py-1 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] sm:min-h-0 sm:px-1 sm:py-0.5"
      onClick={onClick}
    >
      {content}
    </button>
  );
}

export function TasksOverviewHeader({
  title,
  openCount,
  countsLoading,
  counts,
  canViewUnassigned,
  showMetrics,
  t,
  onOpenAllTasks,
  onFilterSelect,
}: TasksOverviewHeaderProps) {
  const showOpenCount = !countsLoading && openCount != null;

  return (
    <div className="shrink-0 border-b border-border/35 px-3.5 py-2.5">
      <div
        className="flex min-w-0 items-center justify-between gap-2"
        data-testid="dashboard-tasks-overview-header-row"
      >
        <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <h2 className={cn(NOTIFICATION_PANEL_TYPO.boxTitle, 'shrink-0')}>{title}</h2>
          {showOpenCount ? (
            <span
              className={cn(NOTIFICATION_PANEL_TYPO.meta, 'shrink-0 text-muted-foreground')}
              data-testid="dashboard-tasks-overview-open-count"
            >
              {t('dashboardTasksOverview.openCountShort', { count: openCount })}
            </span>
          ) : countsLoading ? (
            <span
              className="inline-block h-4 w-14 shrink-0 animate-pulse rounded bg-muted/40"
              data-testid="dashboard-tasks-overview-open-count-loading"
              aria-hidden
            />
          ) : null}
        </div>

        {onOpenAllTasks ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 shrink-0 gap-1 self-center px-2.5"
            onClick={onOpenAllTasks}
          >
            <span className={NOTIFICATION_PANEL_TYPO.cta}>{t('dashboardTasksOverview.allTasks')}</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Button>
        ) : null}
      </div>

      {countsLoading ? (
        <div
          className="mt-2 grid grid-cols-4 gap-1"
          data-testid="dashboard-tasks-overview-loading"
        >
          {Array.from({ length: 4 }).map((_, index) => (
            <span
              key={index}
              className="mx-auto inline-block h-8 w-full max-w-[4.5rem] animate-pulse rounded-md bg-muted/40"
            />
          ))}
        </div>
      ) : showMetrics && counts ? (
        <div
          className="mt-2 grid min-w-0 grid-cols-4 divide-x divide-border/35 overflow-hidden"
          data-testid="dashboard-tasks-overview-status-chips"
        >
          <MetricCell
            label={t('dashboardTasksOverview.overdue')}
            value={counts.overdue}
            tone="critical"
            onClick={
              onFilterSelect
                ? () => onFilterSelect({ kind: 'view', view: 'overdue' })
                : undefined
            }
          />
          <MetricCell
            label={t('dashboardTasksOverview.today')}
            value={counts.today}
            tone="watch"
            onClick={
              onFilterSelect
                ? () => onFilterSelect({ kind: 'view', view: 'today' })
                : undefined
            }
          />
          <MetricCell
            label={t('dashboardTasksOverview.inProgressShort')}
            value={counts.inProgress}
            onClick={
              onFilterSelect
                ? () => onFilterSelect({ kind: 'status', status: 'IN_PROGRESS' })
                : undefined
            }
          />
          <MetricCell
            label={
              <>
                <span className="min-[390px]:hidden">{t('dashboardTasksOverview.unassignedShort')}</span>
                <span className="hidden min-[390px]:inline">{t('dashboardTasksOverview.unassigned')}</span>
              </>
            }
            value={canViewUnassigned ? counts.unassigned : '—'}
            onClick={
              canViewUnassigned && onFilterSelect
                ? () => onFilterSelect({ kind: 'view', view: 'unassigned' })
                : undefined
            }
          />
        </div>
      ) : null}
    </div>
  );
}
