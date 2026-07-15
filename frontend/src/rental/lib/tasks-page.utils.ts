import type { ApiTaskSummary, TaskBucket, TaskCompletionMode, TaskListFilters } from '../../lib/tasks/types';

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
  label: string;
  bucket: TaskBucket;
  /** When true, adds `assignedUserId` for the current user. */
  mine?: boolean;
  /** Hidden unless the user may view the unassigned bucket. */
  requiresUnassignedPermission?: boolean;
}

export const TASKS_PAGE_VIEWS: TasksPageViewMeta[] = [
  { id: 'mine', label: 'Meine Aufgaben', bucket: 'ALL_OPEN', mine: true },
  { id: 'open', label: 'Offen', bucket: 'ALL_OPEN' },
  { id: 'overdue', label: 'Überfällig', bucket: 'OVERDUE' },
  { id: 'today', label: 'Heute', bucket: 'TODAY' },
  { id: 'planned', label: 'Geplant', bucket: 'PLANNED' },
  { id: 'unassigned', label: 'Unzugewiesen', bucket: 'UNASSIGNED', requiresUnassignedPermission: true },
  { id: 'completed', label: 'Erledigt', bucket: 'COMPLETED' },
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
  label: string;
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
      label: 'Überfällig',
      value: bucketCountFromSummary(summary, 'OVERDUE', summary?.overdue ?? 0),
      view: 'overdue',
      tone: 'critical',
    },
    {
      id: 'today',
      label: 'Heute',
      value: bucketCountFromSummary(summary, 'TODAY', summary?.dueToday ?? 0),
      view: 'today',
      tone: 'watch',
    },
    {
      id: 'mine',
      label: 'Meine offenen',
      value: summary?.assignedToMe ?? 0,
      view: 'mine',
      tone: 'info',
    },
  ];

  if (canViewUnassigned) {
    items.push({
      id: 'unassigned',
      label: 'Unzugewiesen',
      value: bucketCountFromSummary(summary, 'UNASSIGNED', 0),
      view: 'unassigned',
      tone: 'neutral',
    });
  }

  return items;
}

export function tasksPageViewCountLabel(view: TasksPageView, count: number): string {
  const meta = findTasksPageViewMeta(view);
  if (count === 0) return `${meta.label} · keine Einträge`;
  if (count === 1) return `${meta.label} · 1 Aufgabe`;
  return `${meta.label} · ${count} Aufgaben`;
}

export function tasksPageEmptyState(view: TasksPageView, hasActiveFilters: boolean): {
  title: string;
  description: string;
} {
  if (hasActiveFilters) {
    return {
      title: 'Keine passenden Aufgaben',
      description: 'Passen Sie die Suche oder Filter an.',
    };
  }

  switch (view) {
    case 'mine':
      return {
        title: 'Keine eigenen Aufgaben',
        description: 'Ihnen sind aktuell keine offenen Aufgaben zugewiesen.',
      };
    case 'open':
      return {
        title: 'Keine offenen Aufgaben',
        description: 'Alle aktivierten Aufgaben sind erledigt oder noch nicht geplant.',
      };
    case 'overdue':
      return {
        title: 'Keine überfälligen Aufgaben',
        description: 'Aktuell liegen keine überfälligen Fälligkeiten vor.',
      };
    case 'today':
      return {
        title: 'Heute nichts fällig',
        description: 'Für heute sind keine Aufgaben im Kalender der Organisation.',
      };
    case 'planned':
      return {
        title: 'Keine geplanten Aufgaben',
        description: 'Es gibt keine Aufgaben mit zukünftiger Aktivierung.',
      };
    case 'unassigned':
      return {
        title: 'Keine unzugewiesenen Aufgaben',
        description: 'Alle aktiven Aufgaben haben einen Bearbeiter.',
      };
    case 'completed':
      return {
        title: 'Noch keine erledigten Aufgaben',
        description: 'Abgeschlossene Aufgaben erscheinen hier.',
      };
    default:
      return {
        title: 'Keine Aufgaben',
        description: 'Es sind noch keine Aufgaben vorhanden.',
      };
  }
}

export const TASK_COMPLETION_MODE_LABELS: Record<TaskCompletionMode, string> = {
  MANUAL: 'Manuell abgeschlossen',
  AUTO_RESOLVED: 'Automatisch aufgelöst',
  SUPERSEDED: 'Ersetzt',
};

export function taskCompletionModeLabel(
  mode: TaskCompletionMode | null | undefined,
): string | null {
  if (!mode || mode === 'MANUAL') return null;
  return TASK_COMPLETION_MODE_LABELS[mode] ?? null;
}
