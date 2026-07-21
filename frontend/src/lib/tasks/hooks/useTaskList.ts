import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { unwrapTaskListPage } from '../../tasks-pagination';
import { matchesTaskListInvalidation, subscribeTaskQueryInvalidation } from '../invalidate';
import { taskQueryKeys } from '../query-keys';
import type { ApiTask, TaskBucket, TaskListFilters } from '../types';

export interface UseTaskListOptions {
  orgId: string | null | undefined;
  filters?: TaskListFilters;
  bucket?: TaskBucket;
  enabled?: boolean;
}

export interface UseTaskListResult {
  queryKey: ReturnType<typeof taskQueryKeys.list> | ReturnType<typeof taskQueryKeys.listBucket>;
  tasks: ApiTask[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
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
}: UseTaskListOptions): UseTaskListResult {
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tasksRef = useRef<ApiTask[]>([]);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const queryKey = bucket
    ? taskQueryKeys.listBucket(orgId ?? '', bucket, filters)
    : taskQueryKeys.list(orgId ?? '', filters);

  const reload = useCallback(async (): Promise<ApiTask[]> => {
    if (!orgId || !enabled) {
      setTasks([]);
      setError(null);
      setHasMore(false);
      setNextCursor(null);
      return [];
    }
    setLoading(true);
    setError(null);
    try {
      const mergedFilters: TaskListFilters = {
        ...filtersRef.current,
        ...(bucket ? { bucket } : {}),
      };
      const page = unwrapTaskListPage(await api.tasks.list(orgId, mergedFilters));
      setTasks(page.data);
      setHasMore(Boolean(page.meta.nextCursor));
      setNextCursor(page.meta.nextCursor);
      return page.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Aufgaben konnten nicht geladen werden';
      setError(message);
      if (!tasksRef.current.length) setTasks([]);
      return tasksRef.current;
    } finally {
      setLoading(false);
    }
  }, [bucket, enabled, orgId]);

  const loadMore = useCallback(async (): Promise<ApiTask[]> => {
    if (!orgId || !enabled || !nextCursor || loadingMore) {
      return tasksRef.current;
    }
    setLoadingMore(true);
    setError(null);
    try {
      const mergedFilters: TaskListFilters = {
        ...filtersRef.current,
        ...(bucket ? { bucket } : {}),
        cursor: nextCursor,
      };
      const page = unwrapTaskListPage(await api.tasks.list(orgId, mergedFilters));
      const merged = [...tasksRef.current, ...page.data];
      setTasks(merged);
      setHasMore(Boolean(page.meta.nextCursor));
      setNextCursor(page.meta.nextCursor);
      return merged;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Weitere Aufgaben konnten nicht geladen werden';
      setError(message);
      return tasksRef.current;
    } finally {
      setLoadingMore(false);
    }
  }, [bucket, enabled, loadingMore, nextCursor, orgId]);

  useEffect(() => {
    void reload();
  }, [reload, queryKey]);

  useEffect(() => {
    if (!orgId) return undefined;
    return subscribeTaskQueryInvalidation((event) => {
      if (matchesTaskListInvalidation(event, orgId, bucket)) {
        void reload();
      }
    });
  }, [bucket, orgId, reload]);

  return {
    queryKey,
    tasks,
    loading,
    loadingMore,
    hasMore,
    error,
    isStale: Boolean(error && tasks.length > 0),
    reload,
    loadMore,
  };
}
