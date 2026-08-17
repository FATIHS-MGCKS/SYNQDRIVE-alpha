/**
 * E6A canonical Evaluations data-layer hooks.
 *
 * Convention: the project uses custom `useState`/`useEffect` fetch hooks over a
 * shared `fetch` wrapper (NO React Query/SWR) — this follows that convention and
 * introduces no second data-fetching framework. Hooks preserve canonical statuses
 * and the discriminated result state; they perform no business calculation.
 *
 * E6A.1 lifecycle correctness:
 *  - No organization → deterministic IDLE (no request, no permanent spinner, no
 *    stale prior-organization data).
 *  - Organization change (A→B) → immediately LOADING (stale A SETTLED data cleared
 *    before B resolves), then SETTLED with B.
 *  - Organization removed (A→null) → IDLE (stale A data cleared).
 *  - Race safety: the effect re-keys on organization+period+station and an `active`
 *    guard ensures a late response for a stale scope never overwrites the current
 *    scope (`shouldApplyResponse` semantics).
 */
import { useEffect, useState } from 'react';
import {
  orgFetchState,
  EVALUATIONS_ASYNC_IDLE,
  EVALUATIONS_ASYNC_LOADING,
  type EvaluationsAnalyticsRequest,
  type EvaluationsAsyncResult,
  type EvaluationsCanonicalResult,
} from '../lib/evaluations/evaluations-request';
import {
  evaluationsQueryKeyString,
  type EvaluationsCapability,
} from '../lib/evaluations/evaluations-query-keys';
import {
  fetchEvaluationsInsightsSummary,
  fetchEvaluationsQuality,
  fetchEvaluationsDriverInfluence,
  fetchEvaluationsRecommendations,
} from '../lib/evaluations/evaluations-analytics-client';
import type {
  EvaluationsAnalyticsInsightsSummary,
  EvaluationsQualityReport,
  EvaluationsDriverInfluenceSection,
} from '../lib/evaluations/evaluations-canonical.types';
import type { EvaluationsRecommendationsResponse } from '@synq/evaluations-recommendations/evaluations-recommendations.contract';

export interface EvaluationsCanonicalAnalytics {
  readonly summary: EvaluationsAsyncResult<EvaluationsAnalyticsInsightsSummary>;
  readonly quality: EvaluationsAsyncResult<EvaluationsQualityReport>;
}

/** Shared hook body: org-lifecycle + race-safe fetch for one canonical capability. */
function useCanonicalResource<T>(
  capability: EvaluationsCapability,
  organizationId: string | null | undefined,
  req: EvaluationsAnalyticsRequest | undefined,
  fetcher: (
    orgId: string,
    req?: EvaluationsAnalyticsRequest,
  ) => Promise<EvaluationsCanonicalResult<T>>,
): EvaluationsAsyncResult<T> {
  const [state, setState] = useState<EvaluationsAsyncResult<T>>(() =>
    orgFetchState<T>(organizationId),
  );
  // key encodes organizationId + period + station scope. When there is no org the
  // key is null, so the effect re-runs on org add/remove/change (scope-safe).
  const key = organizationId ? evaluationsQueryKeyString(capability, organizationId, req) : null;

  useEffect(() => {
    if (!organizationId) {
      // No organization: clear any stale data, settle deterministically on IDLE.
      setState(EVALUATIONS_ASYNC_IDLE);
      return;
    }
    let active = true;
    // Fresh scope: immediately drop any previous-scope data and show LOADING.
    setState(EVALUATIONS_ASYNC_LOADING);
    fetcher(organizationId, req).then((result) => {
      // Race guard: a late response for a superseded scope is discarded.
      if (active) setState({ phase: 'SETTLED', result });
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}

export function useEvaluationsInsightsSummary(
  organizationId: string | null | undefined,
  req?: EvaluationsAnalyticsRequest,
): EvaluationsAsyncResult<EvaluationsAnalyticsInsightsSummary> {
  return useCanonicalResource('insights-summary', organizationId, req, fetchEvaluationsInsightsSummary);
}

export function useEvaluationsQuality(
  organizationId: string | null | undefined,
  req?: EvaluationsAnalyticsRequest,
): EvaluationsAsyncResult<EvaluationsQualityReport> {
  return useCanonicalResource('quality', organizationId, req, fetchEvaluationsQuality);
}

/** Composite page-level hook: E4 summary + E5 quality, one request each. */
export function useEvaluationsCanonicalAnalytics(
  organizationId: string | null | undefined,
  req?: EvaluationsAnalyticsRequest,
): EvaluationsCanonicalAnalytics {
  const summary = useEvaluationsInsightsSummary(organizationId, req);
  const quality = useEvaluationsQuality(organizationId, req);
  return { summary, quality };
}

/**
 * Person-level driver influence — a SEPARATE request (E5B privacy tier resolved
 * server-side). Transports `piiTier`/`driverRef` verbatim; never joins against
 * customers/users/bookings/invoices and never derives identity/authorization.
 */
export function useEvaluationsDriverInfluence(
  organizationId: string | null | undefined,
  req?: EvaluationsAnalyticsRequest,
): EvaluationsAsyncResult<EvaluationsDriverInfluenceSection> {
  return useCanonicalResource('driver-analysis', organizationId, req, fetchEvaluationsDriverInfluence);
}

/** Canonical E7 recommendations — period-aware query key (unlike finance MTD lock). */
export function useEvaluationsRecommendations(
  organizationId: string | null | undefined,
  req?: EvaluationsAnalyticsRequest,
): EvaluationsAsyncResult<EvaluationsRecommendationsResponse> {
  return useCanonicalResource('recommendations', organizationId, req, fetchEvaluationsRecommendations);
}
