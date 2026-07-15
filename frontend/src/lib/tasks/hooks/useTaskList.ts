import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api';
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
  error: string | null;
  reload: () => Promise<ApiTask[]>;
}

export function useTaskList({
  orgId,
  filters,
  bucket,
  enabled = true,
}: UseTaskListOptions): UseTaskListResult {
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const queryKey = bucket
    ? taskQueryKeys.listBucket(orgId ?? '', bucket, filters)
    : taskQueryKeys.list(orgId ?? '', filters);

  const reload = useCallback(async (): Promise<ApiTask[]> => {
    if (!orgId || !enabled) {
      setTasks([]);
      setError(null);
      return [];
    }
    setLoading(true);
    setError(null);
    try {
      const mergedFilters: TaskListFilters = {
        ...filtersRef.current,
        ...(bucket ? { bucket } : {}),
      };
      const rows = await api.tasks.list(orgId, mergedFilters);
      const list = Array.isArray(rows) ? rows : [];
      setTasks(list);
      return list;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Aufgaben konnten nicht geladen werden';
      setError(message);
      setTasks([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [orgId, enabled, bucket]);

  useEffect(() => {
    void reload();
  }, [reload, queryKey.join('|')]);

  useEffect(() => {
    return subscribeTaskQueryInvalidation((detail) => {
      if (!matchesTaskListInvalidation(detail, orgId, bucket)) return;
      void reload();
    });
  }, [orgId, bucket, reload]);

  return { queryKey, tasks, loading, error, reload };
}
