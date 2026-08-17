/**
 * E7 canonical Recommendations / Actions contract (shared authority).
 *
 * Server derives recommendations deterministically from E1–E6 canonical inputs.
 * No predictive/forecast fields, no localized prose — copy keys only for E7C i18n.
 */
import type { EvaluationsMetricStatus } from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import type { EvaluationsMoney } from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import type { EvaluationsPeriodWindow } from '@synq/evaluations-periods/evaluations-period.contract';

export const E7_QUALITY_DIMENSIONS = [
  'FRESHNESS',
  'COMPLETENESS',
  'PROVENANCE',
  'VALIDITY',
  'TEMPORAL_APPLICABILITY',
] as const;

export type E7QualityDimension = (typeof E7_QUALITY_DIMENSIONS)[number];

export const E7_DIMENSION_STATES = ['COMPLETE', 'PARTIAL', 'UNKNOWN', 'UNAVAILABLE'] as const;
export type E7DimensionState = (typeof E7_DIMENSION_STATES)[number];

export type E7QualityLimitation = {
  readonly dimension: E7QualityDimension;
  readonly state: E7DimensionState;
  readonly section?: string;
  readonly reason?: string | null;
};

/** Tenant-safe lineage reference (mirrors E5 shape for provenance transport). */
export interface E7LineageRef {
  readonly sourceCategory: string;
  readonly sourceRef: string;
  readonly effectiveTimestamp: string | null;
  readonly calculationVersion: string;
  readonly reason: string;
}

export const E7_RECOMMENDATIONS_SCHEMA_VERSION = '1.0.0' as const;
export const E7_RECOMMENDATIONS_CALCULATION_VERSION = 'recommendations-e7-v1' as const;

export const E7_RECOMMENDATION_FAMILIES = [
  'WEAKNESS_ATTENTION',
  'STRENGTH_REINFORCE',
  'UTILIZATION_ATTENTION',
  'RECEIVABLES_ATTENTION',
  'OPEN_RECEIVABLES_REVIEW',
  'COST_EVIDENCE_INCOMPLETE',
  'DATA_QUALITY_LIMITED',
  'DRIVER_INFLUENCE_REVIEW',
  'DETECTION_INPUT_SKIPPED',
] as const;

export type E7RecommendationFamily = (typeof E7_RECOMMENDATION_FAMILIES)[number];

/** High-level UI grouping — distinct from sort buckets and families. */
export const E7_RECOMMENDATION_CATEGORIES = [
  'FINANCE',
  'FLEET',
  'OPERATIONS',
  'QUALITY',
  'DRIVER',
  'INSIGHT',
] as const;

export type E7RecommendationCategory = (typeof E7_RECOMMENDATION_CATEGORIES)[number];

export const E7_RECOMMENDATION_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;
export type E7RecommendationSeverity = (typeof E7_RECOMMENDATION_SEVERITIES)[number];

export const E7_RECOMMENDATION_ACTIONABILITY = ['INFORMATIONAL', 'ACTIONABLE'] as const;
export type E7RecommendationActionability = (typeof E7_RECOMMENDATION_ACTIONABILITY)[number];

export const E7_RECOMMENDATION_EMPTY_STATES = ['NO_ACTION_NEEDED', 'INSUFFICIENT_EVIDENCE'] as const;
export type E7RecommendationEmptyState = (typeof E7_RECOMMENDATION_EMPTY_STATES)[number];

export const E7_ACTION_TYPES = [
  'NAVIGATION',
  'FILTER',
  'OPEN_ENTITY',
  'OPEN_WORKFLOW',
] as const;

export type E7ActionType = (typeof E7_ACTION_TYPES)[number];

export const E7_ACTION_TARGET_KINDS = [
  'EVALUATIONS_SECTION',
  'APPLICATION_ROUTE',
  'ENTITY_REFERENCE',
] as const;

export type E7ActionTargetKind = (typeof E7_ACTION_TARGET_KINDS)[number];

export const E7_EVALUATIONS_SECTION_TARGETS = [
  'executive',
  'recommendations',
  'strengths',
  'weaknesses',
  'finance',
  'utilization',
  'cost',
  'driver',
  'quality',
] as const;

export type E7EvaluationsSectionTarget = (typeof E7_EVALUATIONS_SECTION_TARGETS)[number];

export const E7_APPLICATION_ROUTE_TARGETS = ['financial-insights', 'workflow-automation'] as const;
export type E7ApplicationRouteTarget = (typeof E7_APPLICATION_ROUTE_TARGETS)[number];

/** Non-PII entity kinds permitted for ENTITY_REFERENCE actions (emission deferred in E7B). */
export const E7_ENTITY_REFERENCE_KINDS = ['vehicle', 'booking', 'invoice'] as const;
export type E7EntityReferenceKind = (typeof E7_ENTITY_REFERENCE_KINDS)[number];

export const E7_COPY_PARAM_TYPES = ['TEXT', 'NUMBER', 'PERCENT', 'MONEY', 'COUNT'] as const;
export type E7CopyParamType = (typeof E7_COPY_PARAM_TYPES)[number];

export interface E7CopyParam {
  readonly key: string;
  readonly type: E7CopyParamType;
  readonly value: string | number | EvaluationsMoney;
}

export interface E7RecommendationScope {
  readonly organizationId: string;
  readonly stationIds: readonly string[] | null;
  readonly stationScoped: boolean;
}

export interface E7SourcePeriodRef {
  readonly source: string;
  readonly period: EvaluationsPeriodWindow;
}

export interface E7RecommendationProvenance {
  readonly calculationVersion: typeof E7_RECOMMENDATIONS_CALCULATION_VERSION;
  readonly sourceSections: readonly string[];
  readonly sourceRuleIds: readonly string[];
  readonly sourceMetricIds: readonly string[];
  readonly period: EvaluationsPeriodWindow;
  readonly sourcePeriods: readonly E7SourcePeriodRef[];
  readonly scope: E7RecommendationScope;
  readonly inputStatuses: Readonly<Record<string, EvaluationsMetricStatus>>;
  readonly qualityLimitations: readonly E7QualityLimitation[];
  readonly lineageRefs: readonly E7LineageRef[];
  readonly derivationReason: string;
}

export type E7ActionTarget =
  | {
      readonly kind: 'EVALUATIONS_SECTION';
      readonly value: E7EvaluationsSectionTarget;
    }
  | {
      readonly kind: 'APPLICATION_ROUTE';
      readonly value: E7ApplicationRouteTarget;
    }
  | {
      readonly kind: 'ENTITY_REFERENCE';
      readonly entityKind: E7EntityReferenceKind;
      readonly entityId: string;
    };

export interface E7RecommendationAction {
  readonly actionType: E7ActionType;
  readonly mutating: false;
  readonly labelKey: string;
  readonly target: E7ActionTarget;
  readonly requiredPermission?: string;
  readonly confirmationRequired: false;
}

export interface E7Recommendation {
  readonly id: string;
  readonly family: E7RecommendationFamily;
  readonly category: E7RecommendationCategory;
  readonly severity: E7RecommendationSeverity | null;
  readonly titleKey: string;
  readonly explanationKey: string;
  readonly copyParams: readonly E7CopyParam[];
  readonly actionability: E7RecommendationActionability;
  readonly actions: readonly E7RecommendationAction[];
  readonly provenance: E7RecommendationProvenance;
}

export interface EvaluationsRecommendationsResponse {
  readonly schemaVersion: typeof E7_RECOMMENDATIONS_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly calculationVersion: typeof E7_RECOMMENDATIONS_CALCULATION_VERSION;
  readonly requestPeriod: EvaluationsPeriodWindow;
  readonly scope: E7RecommendationScope;
  readonly status: EvaluationsMetricStatus;
  readonly reason: string | null;
  readonly recommendations: readonly E7Recommendation[];
  readonly emptyState: E7RecommendationEmptyState | null;
}
