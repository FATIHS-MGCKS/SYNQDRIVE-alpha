/**
 * E6B: derive a per-section async view from the SHARED E4 summary async, so all core
 * sections consume ONE `/insights/summary` request (no duplicate canonical requests,
 * no N+1). Pure mapping — no business logic.
 */
import type { EvaluationsAsyncResult } from '../../lib/evaluations/evaluations-request';
import type { EvaluationsAnalyticsInsightsSummary } from '../../lib/evaluations/evaluations-canonical.types';

export function deriveSectionAsync<K>(
  summary: EvaluationsAsyncResult<EvaluationsAnalyticsInsightsSummary>,
  select: (s: EvaluationsAnalyticsInsightsSummary) => K,
): EvaluationsAsyncResult<K> {
  if (summary.phase === 'IDLE') return { phase: 'IDLE' };
  if (summary.phase === 'LOADING') return { phase: 'LOADING' };
  const r = summary.result;
  if (r.state === 'AVAILABLE') {
    return { phase: 'SETTLED', result: { state: 'AVAILABLE', data: select(r.data) } };
  }
  // Non-AVAILABLE result variants carry no payload → re-wrap unchanged for K.
  return { phase: 'SETTLED', result: r };
}
