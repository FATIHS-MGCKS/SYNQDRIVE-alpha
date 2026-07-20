import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { matchesTaskListInvalidation, subscribeTaskQueryInvalidation } from '../invalidate';
import { taskQueryKeys } from '../query-keys';
import { mergeTaskListPages, replaceTaskListFirstPage } from '../taskListPagination.utils';
import type { ApiTask, TaskBucket, TaskListFilters } from '../types';

const DEFAULT_PAGE_SIZE = 50;

export interface UseTaskListOptions {
  orgId: string | null | undefined;
  filters?: Omit<TaskListFilters, 'limit' | 'cursor'>;
  bucket?: TaskBucket;
  enabled?: boolean;
  /** When false, loads all pages via `api.tasks.list` (legacy aggregate path). */
  paginated?: boolean;
  pageSize?: number;
}

export interface UseTaskListResult {
  queryKey: ReturnType<typeof taskQueryKeys.list> | ReturnType<typeof taskQueryKeys.listBucket>;
  tasks: ApiTask[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  loadMoreError: string | null;
  hasMore: boolean;
  /** True when the latest fetch failed but a previous successful payload is still shown. */
  isStale: boolean;
  reload: () => Promise<ApiTask[]>;
  loadMore: () => Promise<ApiTask[]>;
}

export function useTaskList({
  orgId,
  filters,
  bucket,
  enabled = true,
  paginated = true,
  pageSize = DEFAULT_PAGE_SIZE,
}: UseTaskListOptions): UseTaskListResult {
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const tasksRef = useRef<ApiTask[]>([]);
  const nextCursorRef = useRef<string | null>(null);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    nextCursorRef.current = nextCursor;
  }, [nextCursor]);

  const queryKey = bucket
    ? taskQueryKeys.listBucket(orgId ?? '', bucket, filters)
    : taskQueryKeys.list(orgId ?? '', filters);

  const buildRequestFilters = useCallback((): TaskListFilters => {
    return {
      ...filtersRef.current,
      ...(bucket ? { bucket } : {}),
    };
  }, [bucket]);

  const reload = useCallback(async (): Promise<ApiTask[]> => {
    if (!orgId || !enabled) {
      setTasks([]);
      setError(null);
      setLoadMoreError(null);
      setNextCursor(null);
      return [];
    }

    setLoading(true);
    setError(null);
    setLoadMoreError(null);

    try {
      if (!paginated) {
        const rows = await api.tasks.list(orgId, buildRequestFilters());
        const list = Array.isArray(rows) ? rows : [];
        setTasks(list);
        setNextCursor(null);
        return list;
      }

      const page = await api.tasks.listPage(orgId, {
        ...buildRequestFilters(),
        limit: pageSize,
      });
      const list = replaceTaskListFirstPage(tasksRef.current, page.data);
      setTasks(list);
      setNextCursor(page.meta.nextCursor);
      return list;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Aufgaben konnten nicht geladen werden';
      setError(message);
      if (tasksRef.current.length === 0) {
        setTasks([]);
        return [];
      }
      return tasksRef.current;
    } finally {
      setLoading(false);
    }
  }, [orgId, enabled, paginated, pageSize, buildRequestFilters]);

  const loadMore = useCallback(async (): Promise<ApiTask[]> => {
    if (!orgId || !enabled || !paginated) return tasksRef.current;
    const cursor = nextCursorRef.current;
    if (!cursor || loadingMore) return tasksRef.current;

    setLoadingMore(true);
    setLoadMoreError(null);

    try {
      const page = await api.tasks.listPage(orgId, {
        ...buildRequestFilters(),
        limit: pageSize,
        cursor,
      });
      const merged = mergeTaskListPages(tasksRef.current, page.data);
      setTasks(merged);
      setNextCursor(page.meta.nextCursor);
      return merged;
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Weitere Aufgaben konnten nicht geladen werden';
      setLoadMoreError(message);
      return tasksRef.current;
    } finally {
      setLoadingMore(false);
    }
  }, [orgId, enabled, paginated, pageSize, loadingMore, buildRequestFilters]);

  useEffect(() => {
    void reload();
  }, [reload, queryKey.join('|')]);

  useEffect(() => {
    return subscribeTaskQueryInvalidation((detail) => {
      if (!matchesTaskListInvalidation(detail, orgId, bucket)) return;
      void reload();
    });
  }, [orgId, bucket, reload]);

  return {
    queryKey,
    tasks,
    loading,
    loadingMore,
    error,
    loadMoreError,
    hasMore: paginated && Boolean(nextCursor),
    isStale: Boolean(error) && tasks.length > 0,
    reload,
    loadMore,
  };
}
