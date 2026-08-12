/**
 * E6A canonical Evaluations analytics client.
 *
 * Thin mapping from the status-aware transport (`api.evaluations.*` →
 * `RequestResult`) to the discriminated `EvaluationsCanonicalResult`. It performs
 * NO business calculation, NO client aggregation, NO privacy/identity derivation,
 * and NO legacy fallback. A feature-disabled 404 becomes an explicit
 * `FEATURE_DISABLED` state (never empty/zero/healthy data).
 */
import { api } from '../../../lib/api';
import type { RequestResult } from '../../../lib/api';
import type { EvaluationsCanonicalResult, EvaluationsAnalyticsRequest } from './evaluations-request';
import type {
  EvaluationsAnalyticsInsightsSummary,
  EvaluationsQualityReport,
  EvaluationsDriverInfluenceSection,
} from './evaluations-canonical.types';

export function mapEvaluationsResult<T>(r: RequestResult<T>): EvaluationsCanonicalResult<T> {
  if (r.ok && r.data !== undefined) return { state: 'AVAILABLE', data: r.data };
  // Feature guard returns 404 when EVALUATIONS_ANALYTICS_V2_MODE is off.
  if (r.status === 404) return { state: 'FEATURE_DISABLED' };
  if (r.status === 403) return { state: 'UNAUTHORIZED' };
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
