import type { ApiTaskSummary, TaskBucket, TaskCompletionMode, TaskListFilters } from '../../lib/tasks/types';
import {
  tasksPageViewLabel,
  tt,
} from '../components/tasks-settings/tasks-i18n';

/** Rental global tasks page views — mapped to canonical backend buckets. */
export type TasksPageView =
  | 'mine'
  | 'open'
  | 'overdue'
  | 'today'
  | 'planned'
  | 'unassigned'
  | 'completed';

export interface TasksPageViewMeta {
  id: TasksPageView;
  bucket: TaskBucket;
  /** When true, adds `assignedUserId` for the current user. */
  mine?: boolean;
  /** Hidden unless the user may view the unassigned bucket. */
  requiresUnassignedPermission?: boolean;
}

export const TASKS_PAGE_VIEWS: TasksPageViewMeta[] = [
  { id: 'mine', bucket: 'ALL_OPEN', mine: true },
  { id: 'open', bucket: 'ALL_OPEN' },
  { id: 'overdue', bucket: 'OVERDUE' },
  { id: 'today', bucket: 'TODAY' },
  { id: 'planned', bucket: 'PLANNED' },
  { id: 'unassigned', bucket: 'UNASSIGNED', requiresUnassignedPermission: true },
  { id: 'completed', bucket: 'COMPLETED' },
];

export function canViewUnassignedTasksBucket(input: {
  userRole: string | null;
  hasPermission: (module: string, level: 'read' | 'write' | 'manage') => boolean;
}): boolean {
  if (input.userRole === 'ORG_ADMIN' || input.userRole === 'MASTER_ADMIN') return true;
  return input.hasPermission('tasks', 'manage');
}

export function getVisibleTasksPageViews(canViewUnassigned: boolean): TasksPageViewMeta[] {
  return TASKS_PAGE_VIEWS.filter(
    (view) => !view.requiresUnassignedPermission || canViewUnassigned,
  );
}

export function findTasksPageViewMeta(view: TasksPageView): TasksPageViewMeta {
  return TASKS_PAGE_VIEWS.find((item) => item.id === view) ?? TASKS_PAGE_VIEWS[1];
}

export function buildTasksPageListFilters(
  view: TasksPageView,
  currentUserId: string | null | undefined,
  extra?: Omit<TaskListFilters, 'bucket'>,
): TaskListFilters {
  const meta = findTasksPageViewMeta(view);
  const filters: TaskListFilters = {
    ...extra,
    bucket: meta.bucket,
  };
  if (meta.mine && currentUserId) {
    filters.assignedUserId = currentUserId;
  }
  return filters;
}

export function bucketCountFromSummary(
  summary: ApiTaskSummary | null | undefined,
  bucket: TaskBucket,
  fallback = 0,
): number {
  const fromBuckets = summary?.buckets?.[bucket];
  if (typeof fromBuckets === 'number') return fromBuckets;
  if (bucket === 'OVERDUE') return summary?.overdue ?? fallback;
  if (bucket === 'TODAY') return summary?.dueToday ?? fallback;
  if (bucket === 'ALL_OPEN') return summary?.active ?? fallback;
  if (bucket === 'COMPLETED') return (summary?.done ?? 0) + (summary?.cancelled ?? 0);
  return fallback;
}

export interface TasksPageKpiItem {
  id: 'overdue' | 'today' | 'mine' | 'unassigned';
  labelKey: 'tasks.view.overdue' | 'tasks.view.today' | 'tasks.kpi.mineOpen' | 'tasks.view.unassigned';
  value: number;
  view: TasksPageView;
  tone: 'critical' | 'watch' | 'info' | 'neutral';
}

export function buildTasksPageKpis(
  summary: ApiTaskSummary | null | undefined,
  canViewUnassigned: boolean,
): TasksPageKpiItem[] {
  const items: TasksPageKpiItem[] = [
    {
      id: 'overdue',
      labelKey: 'tasks.view.overdue',
      value: bucketCountFromSummary(summary, 'OVERDUE', summary?.overdue ?? 0),
      view: 'overdue',
      tone: 'critical',
    },
    {
      id: 'today',
      labelKey: 'tasks.view.today',
      value: bucketCountFromSummary(summary, 'TODAY', summary?.dueToday ?? 0),
      view: 'today',
      tone: 'watch',
    },
    {
      id: 'mine',
      labelKey: 'tasks.kpi.mineOpen',
      value: summary?.assignedToMe ?? 0,
      view: 'mine',
      tone: 'info',
    },
  ];

  if (canViewUnassigned) {
    items.push({
      id: 'unassigned',
      labelKey: 'tasks.view.unassigned',
      value: bucketCountFromSummary(summary, 'UNASSIGNED', 0),
      view: 'unassigned',
      tone: 'neutral',
    });
  }

  return items;
}

export function tasksPageViewCountLabel(locale: string, view: TasksPageView, count: number): string {
  const label = tasksPageViewLabel(locale, view);
  if (count === 0) return tt(locale, 'tasks.count.none', { label });
  if (count === 1) return tt(locale, 'tasks.count.one', { label });
  return tt(locale, 'tasks.count.many', { label, count });
}

export function tasksPageEmptyState(
  locale: string,
  view: TasksPageView,
  hasActiveFilters: boolean,
): {
  title: string;
  description: string;
} {
  if (hasActiveFilters) {
    return {
      title: tt(locale, 'tasks.empty.filtered.title'),
      description: tt(locale, 'tasks.empty.filtered.description'),
    };
  }

  switch (view) {
    case 'mine':
      return {
        title: tt(locale, 'tasks.empty.mine.title'),
        description: tt(locale, 'tasks.empty.mine.description'),
      };
    case 'open':
      return {
        title: tt(locale, 'tasks.empty.open.title'),
        description: tt(locale, 'tasks.empty.open.description'),
      };
    case 'overdue':
      return {
        title: tt(locale, 'tasks.empty.overdue.title'),
        description: tt(locale, 'tasks.empty.overdue.description'),
      };
    case 'today':
      return {
        title: tt(locale, 'tasks.empty.today.title'),
        description: tt(locale, 'tasks.empty.today.description'),
      };
    case 'planned':
      return {
        title: tt(locale, 'tasks.empty.planned.title'),
        description: tt(locale, 'tasks.empty.planned.description'),
      };
    case 'unassigned':
      return {
        title: tt(locale, 'tasks.empty.unassigned.title'),
        description: tt(locale, 'tasks.empty.unassigned.description'),
      };
    case 'completed':
      return {
        title: tt(locale, 'tasks.empty.completed.title'),
        description: tt(locale, 'tasks.empty.completed.description'),
      };
    default:
      return {
        title: tt(locale, 'tasks.empty.default.title'),
        description: tt(locale, 'tasks.empty.default.description'),
      };
  }
}

export function taskCompletionModeLabel(
  locale: string,
  mode: TaskCompletionMode | null | undefined,
): string | null {
  if (!mode || mode === 'MANUAL') return null;
  if (mode === 'AUTO_RESOLVED') return tt(locale, 'tasks.completionMode.autoResolved');
  if (mode === 'SUPERSEDED') return tt(locale, 'tasks.completionMode.superseded');
  return null;
}
