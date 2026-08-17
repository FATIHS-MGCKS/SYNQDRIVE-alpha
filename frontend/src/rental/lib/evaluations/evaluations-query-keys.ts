/**
 * E6A deterministic, scope-safe query keys for Evaluations canonical server state.
 *
 * A key includes every dimension that materially changes the response: capability,
 * organization, selected period, and station scope. Station ids are sorted so the
 * same authorized set always yields the same key (no accidental cache miss/collision).
 * Tenant (organization) is included explicitly so keys never collide across orgs.
 */
import type { EvaluationsAnalyticsRequest } from './evaluations-request';

export type EvaluationsCapability =
  | 'insights-summary'
  | 'quality'
  | 'driver-analysis'
  | 'finance'
  | 'recommendations';

function stationKeyPart(stationIds: readonly string[] | null | undefined): string {
  if (stationIds == null) return 'all';
  if (stationIds.length === 0) return 'none';
  return [...stationIds].map((s) => s.trim()).sort().join(',');
}

/**
 * Build a stable query key. Shape: readonly tuple usable by React Query or a
 * custom cache. `finance` intentionally ignores periodType (E3 is fixed MTD).
 */
export function evaluationsQueryKey(
  capability: EvaluationsCapability,
  organizationId: string,
  req: EvaluationsAnalyticsRequest = {},
): readonly [string, string, string, string, string] {
  const period = capability === 'finance' ? 'MTD' : req.periodType ?? 'DEFAULT';
  return [
    'evaluations',
    capability,
    organizationId,
    period,
    stationKeyPart(req.stationIds),
  ] as const;
}

/** Serialize a query key to a stable string (for map-based caches/dedup). */
export function evaluationsQueryKeyString(
  capability: EvaluationsCapability,
  organizationId: string,
  req: EvaluationsAnalyticsRequest = {},
): string {
  return evaluationsQueryKey(capability, organizationId, req).join('|');
}
