/**
 * E6A canonical Evaluations analytics client.
 *
 * Thin mapping from the status-aware transport (`api.evaluations.*` →
 * `RequestResult`) to the discriminated `EvaluationsCanonicalResult`. It performs
 * NO business calculation, NO client aggregation, NO privacy/identity derivation,
 * and NO legacy fallback. Per E6A.1, a generic HTTP 404 maps to the neutral
 * `NOT_FOUND` state (never a fabricated `FEATURE_DISABLED`, never empty/zero/healthy
 * data); `FEATURE_DISABLED` is reserved for a future reliable, non-leaking
 * discriminator and is not emitted from a bare 404.
 */
import { api } from '../../../lib/api';
import type { RequestResult } from '../../../lib/api';
import type { EvaluationsCanonicalResult, EvaluationsAnalyticsRequest } from './evaluations-request';
import type {
  EvaluationsAnalyticsInsightsSummary,
  EvaluationsQualityReport,
  EvaluationsDriverInfluenceSection,
} from './evaluations-canonical.types';
import type { EvaluationsRecommendationsResponse } from '@synq/evaluations-recommendations/evaluations-recommendations.contract';

export function mapEvaluationsResult<T>(r: RequestResult<T>): EvaluationsCanonicalResult<T> {
  if (r.ok && r.data !== undefined) return { state: 'AVAILABLE', data: r.data };
  if (r.status === 403) return { state: 'UNAUTHORIZED' };
  // E6A.1: a generic 404 is NOT proof of a disabled feature. The FeatureGuard
  // returns a deliberately generic `NotFoundException('Not found')` (no
  // machine-readable discriminator, to avoid leaking disabled-route existence), and
  // a 404 can equally be a genuine not-found. Map to the neutral NOT_FOUND state —
  // never a fabricated FEATURE_DISABLED, never legacy fallback, never empty/zero.
  if (r.status === 404) return { state: 'NOT_FOUND' };
  return { state: 'ERROR', message: r.errorMessage ?? 'Request failed' };
}

function toClientReq(req?: EvaluationsAnalyticsRequest): {
  periodType?: string;
  stationIds?: readonly string[] | null;
} {
  return { periodType: req?.periodType, stationIds: req?.stationIds ?? null };
}

export async function fetchEvaluationsInsightsSummary(
  organizationId: string,
  req?: EvaluationsAnalyticsRequest,
): Promise<EvaluationsCanonicalResult<EvaluationsAnalyticsInsightsSummary>> {
  return mapEvaluationsResult(
    await api.evaluations.analyticsInsightsSummary(organizationId, toClientReq(req)),
  );
}

export async function fetchEvaluationsQuality(
  organizationId: string,
  req?: EvaluationsAnalyticsRequest,
): Promise<EvaluationsCanonicalResult<EvaluationsQualityReport>> {
  return mapEvaluationsResult(
    await api.evaluations.analyticsQuality(organizationId, toClientReq(req)),
  );
}

export async function fetchEvaluationsDriverInfluence(
  organizationId: string,
  req?: EvaluationsAnalyticsRequest,
): Promise<EvaluationsCanonicalResult<EvaluationsDriverInfluenceSection>> {
  return mapEvaluationsResult(
    await api.evaluations.driverAnalysis(organizationId, toClientReq(req)),
  );
}

export async function fetchEvaluationsRecommendations(
  organizationId: string,
  req?: EvaluationsAnalyticsRequest,
): Promise<EvaluationsCanonicalResult<EvaluationsRecommendationsResponse>> {
  return mapEvaluationsResult(
    await api.evaluations.analyticsRecommendations(organizationId, toClientReq(req)),
  );
}
