/**
 * E6A canonical Evaluations data-layer hooks.
 *
 * Convention: the project uses custom `useState`/`useEffect` fetch hooks over a
 * shared `fetch` wrapper (NO React Query/SWR) — this follows that convention and
 * introduces no second data-fetching framework. Hooks preserve canonical statuses
 * and the discriminated result state (LOADING vs AVAILABLE vs FEATURE_DISABLED vs
 * UNAUTHORIZED vs ERROR); they perform no business calculation.
 *
 * Scope safety: the effect depends on a serialized, scope-safe query key, and an
 * `active` guard ensures a late response for a stale period/station scope can never
 * overwrite the currently selected scope (no race condition).
 *
 * Deduplication: `useEvaluationsCanonicalAnalytics` fetches the E4 summary + E5
 * quality ONCE for the whole page; sections consume its result rather than each
 * re-requesting the summary (EXPECTED_INITIAL_REQUEST_COUNT = 2 here; driver
 * influence is a separate person-level request, fetched lazily by its own hook).
 */
import { useEffect, useState } from 'react';
import type { EvaluationsAnalyticsRequest, EvaluationsAsyncResult } from '../lib/evaluations/evaluations-request';
import { evaluationsQueryKeyString } from '../lib/evaluations/evaluations-query-keys';
import {
  fetchEvaluationsInsightsSummary,
  fetchEvaluationsQuality,
  fetchEvaluationsDriverInfluence,
} from '../lib/evaluations/evaluations-analytics-client';
import type {
  EvaluationsAnalyticsInsightsSummary,
  EvaluationsQualityReport,
  EvaluationsDriverInfluenceSection,
} from '../lib/evaluations/evaluations-canonical.types';

export interface EvaluationsCanonicalAnalytics {
  readonly summary: EvaluationsAsyncResult<EvaluationsAnalyticsInsightsSummary>;
  readonly quality: EvaluationsAsyncResult<EvaluationsQualityReport>;
}

const LOADING = { loading: true, result: null } as const;

export function useEvaluationsInsightsSummary(
  organizationId: string | null | undefined,
  req?: EvaluationsAnalyticsRequest,
): EvaluationsAsyncResult<EvaluationsAnalyticsInsightsSummary> {
  const [state, setState] =
    useState<EvaluationsAsyncResult<EvaluationsAnalyticsInsightsSummary>>(LOADING);
  const key = organizationId
    ? evaluationsQueryKeyString('insights-summary', organizationId, req)
    : null;
  useEffect(() => {
    if (!organizationId) return;
    let active = true;
    setState(LOADING);
    fetchEvaluationsInsightsSummary(organizationId, req).then((result) => {
      if (active) setState({ loading: false, result });
    });
    return () => {
      active = false;
    };
    // key encodes organizationId + periodType + stationIds (scope-safe).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

export function useEvaluationsQuality(
  organizationId: string | null | undefined,
  req?: EvaluationsAnalyticsRequest,
): EvaluationsAsyncResult<EvaluationsQualityReport> {
  const [state, setState] = useState<EvaluationsAsyncResult<EvaluationsQualityReport>>(LOADING);
  const key = organizationId
    ? evaluationsQueryKeyString('quality', organizationId, req)
    : null;
  useEffect(() => {
    if (!organizationId) return;
    let active = true;
    setState(LOADING);
    fetchEvaluationsQuality(organizationId, req).then((result) => {
      if (active) setState({ loading: false, result });
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
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
 * server-side). The hook transports `piiTier`/`driverRef` verbatim; it never joins
 * against customers/users/bookings/invoices and never derives identity/authorization.
 */
export function useEvaluationsDriverInfluence(
  organizationId: string | null | undefined,
  req?: EvaluationsAnalyticsRequest,
): EvaluationsAsyncResult<EvaluationsDriverInfluenceSection> {
  const [state, setState] =
    useState<EvaluationsAsyncResult<EvaluationsDriverInfluenceSection>>(LOADING);
  const key = organizationId
    ? evaluationsQueryKeyString('driver-analysis', organizationId, req)
    : null;
  useEffect(() => {
    if (!organizationId) return;
    let active = true;
    setState(LOADING);
    fetchEvaluationsDriverInfluence(organizationId, req).then((result) => {
      if (active) setState({ loading: false, result });
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}
