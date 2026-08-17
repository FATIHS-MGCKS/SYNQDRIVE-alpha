import type { EvaluationsPeriodWindow } from '@synq/evaluations-periods/evaluations-period.contract';
import type { E7RecommendationFamily } from './evaluations-recommendations.contract';

export interface E7RecommendationIdentityInput {
  readonly organizationId: string;
  readonly stationIds: readonly string[] | null;
  readonly period: EvaluationsPeriodWindow;
  readonly family: E7RecommendationFamily;
  readonly sourceRuleId: string | null;
  readonly sourceMetricId: string | null;
  readonly dimension: string | null;
  readonly derivationReason: string;
  /** Disambiguates per-currency finance recommendations. */
  readonly currency: string | null;
}

export function canonicalStationScopeKey(stationIds: readonly string[] | null): string {
  if (!stationIds || stationIds.length === 0) return 'org';
  return [...stationIds].sort().join(',');
}

export function canonicalPeriodKey(period: EvaluationsPeriodWindow): string {
  return [
    period.periodType,
    period.start,
    period.endExclusive,
    period.reference,
    period.timezone.effectiveTimezone,
  ].join('|');
}

export function buildE7RecommendationIdentityMaterial(input: E7RecommendationIdentityInput): string {
  return [
    input.organizationId,
    canonicalStationScopeKey(input.stationIds),
    canonicalPeriodKey(input.period),
    input.family,
    input.sourceRuleId ?? '',
    input.sourceMetricId ?? '',
    input.dimension ?? '',
    input.derivationReason,
    input.currency ?? '',
  ].join('::');
}

/** Deterministic FNV-1a 32-bit hash rendered as 8 hex chars (stable cross-runtime). */
export function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function computeE7RecommendationStableId(material: string): string {
  // Two rounds widen entropy without randomness.
  return `${fnv1aHex(material)}${fnv1aHex(`v1:${material}`)}`;
}

export function buildE7RecommendationId(input: E7RecommendationIdentityInput): string {
  return computeE7RecommendationStableId(buildE7RecommendationIdentityMaterial(input));
}
