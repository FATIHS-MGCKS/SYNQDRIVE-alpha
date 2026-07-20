import { useCallback, useEffect, useState } from 'react';
import { api, type ApiServiceCase } from '../../api';
import {
  matchesServiceCaseDetailInvalidation,
  subscribeServiceCaseQueryInvalidation,
} from '../invalidate';
import { serviceCaseQueryKeys } from '../query-keys';

export interface UseServiceCaseDetailOptions {
  orgId: string | null | undefined;
  serviceCaseId: string | null | undefined;
  enabled?: boolean;
}

export interface UseServiceCaseDetailResult {
  queryKey: ReturnType<typeof serviceCaseQueryKeys.detail> | null;
  serviceCase: ApiServiceCase | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<ApiServiceCase | null>;
}

export function useServiceCaseDetail({
  orgId,
  serviceCaseId,
  enabled = true,
}: UseServiceCaseDetailOptions): UseServiceCaseDetailResult {
  const [serviceCase, setServiceCase] = useState<ApiServiceCase | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryKey =
    orgId && serviceCaseId ? serviceCaseQueryKeys.detail(orgId, serviceCaseId) : null;

  const reload = useCallback(async (): Promise<ApiServiceCase | null> => {
    if (!orgId || !serviceCaseId || !enabled) {
      setServiceCase(null);
      setError(null);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const detail = await api.serviceCases.get(orgId, serviceCaseId);
      setServiceCase(detail);
      return detail;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Servicefall konnte nicht geladen werden';
      setError(message);
      setServiceCase(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [orgId, serviceCaseId, enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    return subscribeServiceCaseQueryInvalidation((detail) => {
      if (!matchesServiceCaseDetailInvalidation(detail, orgId, serviceCaseId)) return;
      void reload();
    });
  }, [orgId, serviceCaseId, reload]);

  return { queryKey, serviceCase, loading, error, reload };
}
