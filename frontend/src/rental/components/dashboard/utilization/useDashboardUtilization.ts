import { useCallback, useEffect, useState } from 'react';
import { fetchDashboardUtilizationOverview } from '../../../lib/dashboard-utilization.api';
import type { DashboardUtilizationOverview } from '../../../lib/dashboard-utilization.types';

export type DashboardUtilizationPhase = 'idle' | 'loading' | 'settled' | 'error';

function currentMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

export function useDashboardUtilization(
  organizationId: string | null | undefined,
  stationId: string | null,
) {
  const [month, setMonth] = useState(currentMonth);
  const [phase, setPhase] = useState<DashboardUtilizationPhase>('idle');
  const [data, setData] = useState<DashboardUtilizationOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) {
      setPhase('idle');
      setData(null);
      setError(null);
      return;
    }
    setPhase('loading');
    setError(null);
    try {
      const overview = await fetchDashboardUtilizationOverview(organizationId, {
        year: month.year,
        month: month.month,
        stationId,
      });
      setData(overview);
      setPhase(overview ? 'settled' : 'error');
      if (!overview) setError('load_failed');
    } catch {
      setData(null);
      setPhase('error');
      setError('load_failed');
    }
  }, [organizationId, month.month, month.year, stationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const goToPreviousMonth = useCallback(() => {
    setMonth((current) => {
      if (current.month === 1) return { year: current.year - 1, month: 12 };
      return { year: current.year, month: current.month - 1 };
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setMonth((current) => {
      if (current.month === 12) return { year: current.year + 1, month: 1 };
      return { year: current.year, month: current.month + 1 };
    });
  }, []);

  return {
    month,
    phase,
    data,
    error,
    reload: load,
    goToPreviousMonth,
    goToNextMonth,
  };
}
