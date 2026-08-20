import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { ApiFleetReadinessSummaryResponse } from '../lib/notifications/notification-api.types';
import { useRequestGeneration } from './request-generation';

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
  const { nextGeneration, isCurrent } = useRequestGeneration();
  const [summary, setSummary] = useState<ApiFleetReadinessSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!orgId || !enabled) {
      nextGeneration();
      setSummary(null);
      setError(null);
      setLoading(false);
      return;
    }

    const generation = nextGeneration();
    setLoading(true);
    setError(null);

    try {
      const result = await api.rentalHealth.getFleetSummary(orgId, {
        stationId: stationId ?? undefined,
      });
      if (!isCurrent(generation)) return;
      setSummary(result);
    } catch (err) {
      if (!isCurrent(generation)) return;
      setError(err instanceof Error ? err : new Error('Failed to load fleet readiness summary'));
      setSummary(null);
    } finally {
      if (isCurrent(generation)) {
        setLoading(false);
      }
    }
  }, [orgId, stationId, enabled, nextGeneration, isCurrent]);

  const refresh = useCallback(async () => {
    await fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  return { summary, loading, error, refresh };
}
