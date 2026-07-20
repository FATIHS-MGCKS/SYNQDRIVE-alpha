import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import {
  matchesServiceCaseSummaryInvalidation,
  subscribeServiceCaseQueryInvalidation,
} from '../invalidate';
import { serviceCaseQueryKeys } from '../query-keys';
import type { ApiServiceCaseSummary } from '../types';

export interface UseServiceCaseSummaryOptions {
  orgId: string | null | undefined;
  enabled?: boolean;
}

export interface UseServiceCaseSummaryResult {
  queryKey: ReturnType<typeof serviceCaseQueryKeys.summary> | null;
  summary: ApiServiceCaseSummary | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<ApiServiceCaseSummary | null>;
}

export function useServiceCaseSummary({
  orgId,
  enabled = true,
}: UseServiceCaseSummaryOptions): UseServiceCaseSummaryResult {
  const [summary, setSummary] = useState<ApiServiceCaseSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryKey = orgId ? serviceCaseQueryKeys.summary(orgId) : null;

  const reload = useCallback(async (): Promise<ApiServiceCaseSummary | null> => {
    if (!orgId || !enabled) {
      setSummary(null);
      setError(null);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.serviceCases.summary(orgId);
      setSummary(data);
      return data;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Servicefall-Zusammenfassung fehlgeschlagen';
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
    return subscribeServiceCaseQueryInvalidation((detail) => {
      if (!matchesServiceCaseSummaryInvalidation(detail, orgId)) return;
      void reload();
    });
  }, [orgId, reload]);

  return { queryKey, summary, loading, error, reload };
}
