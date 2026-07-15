import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { matchesTaskDetailInvalidation, subscribeTaskQueryInvalidation } from '../invalidate';
import { taskQueryKeys } from '../query-keys';
import type { ApiTaskDetail } from '../types';

export interface UseTaskDetailOptions {
  orgId: string | null | undefined;
  taskId: string | null | undefined;
  enabled?: boolean;
}

export interface UseTaskDetailResult {
  queryKey: ReturnType<typeof taskQueryKeys.detail> | null;
  task: ApiTaskDetail | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<ApiTaskDetail | null>;
}

export function useTaskDetail({
  orgId,
  taskId,
  enabled = true,
}: UseTaskDetailOptions): UseTaskDetailResult {
  const [task, setTask] = useState<ApiTaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryKey = orgId && taskId ? taskQueryKeys.detail(orgId, taskId) : null;

  const reload = useCallback(async (): Promise<ApiTaskDetail | null> => {
    if (!orgId || !taskId || !enabled) {
      setTask(null);
      setError(null);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const detail = await api.tasks.get(orgId, taskId);
      setTask(detail);
      return detail;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Aufgabe konnte nicht geladen werden';
      setError(message);
      setTask(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [orgId, taskId, enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    return subscribeTaskQueryInvalidation((detail) => {
      if (!matchesTaskDetailInvalidation(detail, orgId, taskId)) return;
      void reload();
    });
  }, [orgId, taskId, reload]);

  return { queryKey, task, loading, error, reload };
}
