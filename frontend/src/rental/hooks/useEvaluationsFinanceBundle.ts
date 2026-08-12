/**
 * E6B: canonical E3 Finance bundle hook (always-on endpoint, MTD authority).
 * Follows the E6A hook lifecycle (phased IDLE/LOADING/SETTLED, org-scope safety,
 * stale-response guard). Finance truth belongs to E3; this hook only transports it —
 * no client recomputation. Kept separate from the flag-gated E4 summary so Finance
 * remains available even when the analytics feature is disabled.
 */
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import {
  orgFetchState,
  EVALUATIONS_ASYNC_IDLE,
  EVALUATIONS_ASYNC_LOADING,
  type EvaluationsAnalyticsRequest,
  type EvaluationsAsyncResult,
} from '../lib/evaluations/evaluations-request';
import { evaluationsQueryKeyString } from '../lib/evaluations/evaluations-query-keys';
import type { FinancialInsightsBundleDto } from '../lib/finance-insights.types';

export function useEvaluationsFinanceBundle(
  organizationId: string | null | undefined,
  req?: EvaluationsAnalyticsRequest,
): EvaluationsAsyncResult<FinancialInsightsBundleDto> {
  const [state, setState] = useState<EvaluationsAsyncResult<FinancialInsightsBundleDto>>(() =>
    orgFetchState<FinancialInsightsBundleDto>(organizationId),
  );
  // Finance ignores the analytics period (fixed MTD); station scope still matters.
  const key = organizationId ? evaluationsQueryKeyString('finance', organizationId, req) : null;

  useEffect(() => {
    if (!organizationId) {
      setState(EVALUATIONS_ASYNC_IDLE);
      return;
    }
    let active = true;
    setState(EVALUATIONS_ASYNC_LOADING);
    const stationIds = req?.stationIds ? [...req.stationIds] : undefined;
    api.evaluations
      .financeInsights(organizationId, stationIds)
      .then((data) => {
        if (active) setState({ phase: 'SETTLED', result: { state: 'AVAILABLE', data } });
      })
      .catch((e: unknown) => {
        if (active) {
          setState({
            phase: 'SETTLED',
            result: { state: 'ERROR', message: e instanceof Error ? e.message : 'Finance load failed' },
          });
        }
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
