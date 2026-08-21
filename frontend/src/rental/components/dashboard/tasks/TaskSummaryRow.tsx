import { memo } from 'react';
import { ListTodo } from 'lucide-react';
import { cn } from '../../../../components/ui/utils';
import type { ApiTask } from '../../../../lib/api';
import { deriveTaskIsOverdue } from '../../../lib/task-display.utils';
import type { TranslationKey } from '../../../i18n/translations/en';
import { NOTIFICATION_PANEL_TYPO } from '../notifications/notificationPanelTypography';
import { isTaskDueToday } from '../dashboardTasksOverview.utils';
import {
  dueToneClassName,
  priorityBadgeClassName,
  resolveDashboardTaskDomainKey,
  resolveTaskPreviewPriority,
  taskPreviewDueTone,
  taskPreviewPriorityBadgeTone,
  taskPreviewPriorityLabelKey,
} from './dashboardTaskPreviewDisplay.utils';
import { Icon } from '../../ui/Icon';

export interface TaskSummaryRowProps {
  task: ApiTask;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  locale: string;
  expanded: boolean;
  controlsId: string;
  onToggle: () => void;
}

function formatTaskDueLabel(
  task: ApiTask,
  t: TaskSummaryRowProps['t'],
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

function resolveAssigneeName(
  task: ApiTask,
  t: TaskSummaryRowProps['t'],
): string {
  if (!task.assignedUserId) {
    return t('dashboardTasksOverview.notAssigned');
  }
  return task.assignedUserName?.trim() || t('dashboardTasksOverview.notAssigned');
}

export const TaskSummaryRow = memo(function TaskSummaryRow({
  task,
  t,
  locale,
  expanded,
  controlsId,
  onToggle,
}: TaskSummaryRowProps) {
  const priority = resolveTaskPreviewPriority(task);
  const priorityTone = taskPreviewPriorityBadgeTone(priority);
  const dueTone = taskPreviewDueTone(task);
  const domainKey = resolveDashboardTaskDomainKey(task);
  const assigneeName = resolveAssigneeName(task, t);

  return (
    <div className="w-full text-left">
      <div className="flex w-full items-center gap-2">
        <div className="relative shrink-0 self-center" aria-hidden>
          <div className={cn(NOTIFICATION_PANEL_TYPO.iconWrap, 'bg-muted/50 text-muted-foreground')}>
            <ListTodo className={NOTIFICATION_PANEL_TYPO.icon} />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span
            className={cn(
              NOTIFICATION_PANEL_TYPO.metaBadge,
              'max-w-[46%] shrink-0 whitespace-nowrap sm:max-w-none',
              priorityBadgeClassName(priorityTone),
            )}
          >
            {t(taskPreviewPriorityLabelKey(priority))}
          </span>
          <span className={cn(NOTIFICATION_PANEL_TYPO.eyebrow, 'min-w-0 truncate')}>
            {t(domainKey)}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <span
            className={cn(
              NOTIFICATION_PANEL_TYPO.lastSeen,
              'whitespace-nowrap text-right tabular-nums',
              dueToneClassName(dueTone),
            )}
          >
            {formatTaskDueLabel(task, t, locale)}
          </span>
          <button
            type="button"
            className={cn(
              'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-transform hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] motion-reduce:transition-none',
              expanded && 'rotate-180',
            )}
            aria-expanded={expanded}
            aria-controls={controlsId}
            aria-label={expanded ? t('notification.collapseDetails') : t('notification.expandDetails')}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          >
            <Icon name="chevron-down" className="h-4 w-4" />
          </button>
        </div>
      </div>

      <p className={cn(NOTIFICATION_PANEL_TYPO.cardTitle, 'mt-0.5 text-pretty pl-10')}>
        {task.title?.trim() || '—'}
      </p>

      <p className={cn(NOTIFICATION_PANEL_TYPO.meta, 'mt-1 pl-10 text-muted-foreground')}>
        {t('dashboardTasksOverview.assignedTo', { name: assigneeName })}
      </p>
    </div>
  );
});
