import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useRentalOrg } from '../RentalContext';
import {
  buildEvaluationsForecastsSection,
  type BacktestResultRow,
  type OperationalForecastRow,
  type RegistryRow,
  type RiskForecastRow,
} from '../lib/evaluations-forecast-view-model';

export type EvaluationsForecastsLoadState = {
  loading: boolean;
  error: string | null;
  section: ReturnType<typeof buildEvaluationsForecastsSection> | null;
  refresh: () => void;
};

export function useEvaluationsForecasts(stationLabel?: string | null): EvaluationsForecastsLoadState {
  const { orgId } = useRentalOrg();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [operational, setOperational] = useState<OperationalForecastRow[]>([]);
  const [risk, setRisk] = useState<RiskForecastRow[]>([]);
  const [registry, setRegistry] = useState<RegistryRow[]>([]);
  const [backtests, setBacktests] = useState<BacktestResultRow[]>([]);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      api.evaluationsForecasts.list(orgId),
      api.evaluationsForecasts.listRisk(orgId),
      api.evaluationsForecasts.listRegistry(orgId),
      api.evaluationsForecasts.listBacktestResults(orgId),
    ])
      .then(([op, rk, reg, bt]) => {
        if (cancelled) return;
        setOperational(op as OperationalForecastRow[]);
        setRisk(rk as RiskForecastRow[]);
        setRegistry(reg as RegistryRow[]);
        setBacktests(bt as BacktestResultRow[]);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Prognosen konnten nicht geladen werden');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [orgId, tick]);

  const section =
    orgId && !loading && !error
      ? buildEvaluationsForecastsSection({
          operational,
          risk,
          registry,
          backtests,
          stationLabel,
        })
      : null;

  return { loading, error, section, refresh };
}
