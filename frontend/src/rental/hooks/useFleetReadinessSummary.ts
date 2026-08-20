import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type { ApiFleetReadinessSummaryResponse } from '../lib/notifications/notification-api.types';

export interface UseFleetReadinessSummaryOptions {
  orgId: string | null | undefined;
  stationId?: string | null;
  enabled?: boolean;
}

export interface UseFleetReadinessSummaryResult {
  summary: ApiFleetReadinessSummaryResponse | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useFleetReadinessSummary({
  orgId,
  stationId,
  enabled = true,
}: UseFleetReadinessSummaryOptions): UseFleetReadinessSummaryResult {
  const [summary, setSummary] = useState<ApiFleetReadinessSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const cancelRef = useRef(false);

  const fetchSummary = useCallback(async () => {
    if (!orgId || !enabled) {
      setSummary(null);
      setError(null);
      return;
    }

    cancelRef.current = false;
    setLoading(true);
    setError(null);

    try {
      const result = await api.rentalHealth.getFleetSummary(orgId, {
        stationId: stationId ?? undefined,
      });
      if (cancelRef.current) return;
      setSummary(result);
    } catch (err) {
      if (cancelRef.current) return;
      setError(err instanceof Error ? err : new Error('Failed to load fleet readiness summary'));
      setSummary(null);
    } finally {
      if (!cancelRef.current) setLoading(false);
    }
  }, [orgId, stationId, enabled]);

  const refresh = useCallback(async () => {
    await fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    cancelRef.current = false;
    void fetchSummary();
    return () => {
      cancelRef.current = true;
    };
  }, [fetchSummary]);

  return { summary, loading, error, refresh };
}
