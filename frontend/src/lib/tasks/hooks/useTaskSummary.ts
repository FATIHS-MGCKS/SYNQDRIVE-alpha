import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { matchesTaskSummaryInvalidation, subscribeTaskQueryInvalidation } from '../invalidate';
import { taskQueryKeys } from '../query-keys';
import type { ApiTaskSummary } from '../types';

export interface UseTaskSummaryOptions {
  orgId: string | null | undefined;
  enabled?: boolean;
}

export interface UseTaskSummaryResult {
  queryKey: ReturnType<typeof taskQueryKeys.summary> | null;
  summary: ApiTaskSummary | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<ApiTaskSummary | null>;
}

export function useTaskSummary({
  orgId,
  enabled = true,
}: UseTaskSummaryOptions): UseTaskSummaryResult {
  const [summary, setSummary] = useState<ApiTaskSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryKey = orgId ? taskQueryKeys.summary(orgId) : null;

  const reload = useCallback(async (): Promise<ApiTaskSummary | null> => {
    if (!orgId || !enabled) {
      setSummary(null);
      setError(null);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.tasks.summary(orgId);
      setSummary(data);
      return data;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Task-Zusammenfassung fehlgeschlagen';
      setError(message);
      setSummary(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [orgId, enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    return subscribeTaskQueryInvalidation((detail) => {
      if (!matchesTaskSummaryInvalidation(detail, orgId)) return;
      void reload();
    });
  }, [orgId, reload]);

  return { queryKey, summary, loading, error, reload };
}
