import { useMemo } from 'react';
import type { ApiTask } from '../../../lib/api';
import { useTaskList, useTaskSummary } from '../../../lib/tasks';
import type { TaskListFilters } from '../../../lib/tasks/types';
import {
  buildTasksPageKpis,
  canViewUnassignedTasksBucket,
  findTasksPageViewMeta,
  type TasksPageView,
} from '../../lib/tasks-page.utils';
import {
  buildTasksPageResultLabel,
  buildTasksPageViewCounts,
  resolveTasksPageSummaryCount,
} from './tasksPageViewModel.utils';

export interface UseTasksPageViewModelOptions {
  orgId: string | null | undefined;
  view: TasksPageView;
  apiFilters: TaskListFilters;
  currentUserId: string | null | undefined;
  userRole: string | null;
  hasPermission: (module: string, level: 'read' | 'write' | 'manage') => boolean;
  pageSize?: number;
}

export interface UseTasksPageViewModelResult {
  rawTasks: ApiTask[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  loadMoreError: string | null;
  hasMore: boolean;
  isStale: boolean;
  reload: () => Promise<ApiTask[]>;
  loadMore: () => Promise<ApiTask[]>;
  summary: ReturnType<typeof useTaskSummary>['summary'];
  summaryLoading: boolean;
  summaryError: string | null;
  viewCounts: Partial<Record<TasksPageView, number>>;
  kpis: ReturnType<typeof buildTasksPageKpis>;
  resultLabel: string;
  summaryCount: number;
  canViewUnassigned: boolean;
  listEnabled: boolean;
}

export function useTasksPageViewModel({
  orgId,
  view,
  apiFilters,
  currentUserId: _currentUserId,
  userRole,
  hasPermission,
  pageSize = 50,
}: UseTasksPageViewModelOptions): UseTasksPageViewModelResult {
  const canViewUnassigned = canViewUnassignedTasksBucket({ userRole, hasPermission });
  const listEnabled = Boolean(orgId) && (view !== 'unassigned' || canViewUnassigned);

  const {
    tasks: rawTasks,
    loading,
    loadingMore,
    error,
    loadMoreError,
    hasMore,
    isStale,
    reload,
    loadMore,
  } = useTaskList({
    orgId,
    filters: apiFilters,
    enabled: listEnabled,
    paginated: true,
    pageSize,
  });

  const { summary, loading: summaryLoading, error: summaryError } = useTaskSummary({ orgId });

  const viewMeta = findTasksPageViewMeta(view);
  const summaryCount = resolveTasksPageSummaryCount(summary, view, viewMeta.bucket);

  const viewCounts = useMemo(
    () => buildTasksPageViewCounts(summary, canViewUnassigned),
    [summary, canViewUnassigned],
  );

  const kpis = useMemo(
    () => buildTasksPageKpis(summary, canViewUnassigned),
    [canViewUnassigned, summary],
  );

  const resultLabel = useMemo(
    () => buildTasksPageResultLabel(view, rawTasks.length, summaryCount, hasMore),
    [view, rawTasks.length, summaryCount, hasMore],
  );

  return {
    rawTasks,
    loading,
    loadingMore,
    error,
    loadMoreError,
    hasMore,
    isStale,
    reload,
    loadMore,
    summary,
    summaryLoading,
    summaryError,
    viewCounts,
    kpis,
    resultLabel,
    summaryCount,
    canViewUnassigned,
    listEnabled,
  };
}
