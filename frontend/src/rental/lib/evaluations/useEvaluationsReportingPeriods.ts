import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type { EvaluationsReportingPeriodBundle } from '@synq/evaluations-periods/evaluations-period.contract';

export interface UseEvaluationsReportingPeriodsResult {
  bundle: EvaluationsReportingPeriodBundle | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useEvaluationsReportingPeriods(
  orgId: string | null | undefined,
  options?: { stationId?: string | null },
): UseEvaluationsReportingPeriodsResult {
  const [bundle, setBundle] = useState<EvaluationsReportingPeriodBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!orgId) {
      setBundle(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await api.evaluations.reportingBundle(orgId, {
        stationId: options?.stationId ?? undefined,
      });
      setBundle(result);
    } catch {
      setBundle(null);
      setError('Reporting periods could not be resolved.');
    } finally {
      setLoading(false);
    }
  }, [orgId, options?.stationId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { bundle, loading, error, reload };
}
