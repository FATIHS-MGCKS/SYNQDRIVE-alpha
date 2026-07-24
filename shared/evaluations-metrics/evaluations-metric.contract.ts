/**
 * Shared contract for SynqDrive Auswertungen metric registry.
 * Source of truth for enums and record shape — consumed by backend registry and frontend types.
 *
 * @see docs/architecture/analytics/evaluations-kpi-taxonomy.md
 * @see docs/architecture/analytics/evaluations-metric-registry.md
 */

/** Domains from evaluations-kpi-taxonomy.md §3 */
export const EVALUATIONS_METRIC_CATEGORIES = [
  'REVENUE',
  'CASHFLOW',
  'RECEIVABLES',
  'COSTS',
  'CONTRIBUTION_MARGIN',
  'BOOKINGS',
  'UTILIZATION',
  'FLEET_AVAILABILITY',
  'DOWNTIME',
  'MAINTENANCE',
  'DAMAGE',
  'COMPLIANCE',
  'CUSTOMERS',
  'STATIONS',
  'OPERATIONAL_QUALITY',
  'DATA_QUALITY',
  'RISKS',
  'RECOMMENDATIONS',
  'FORECASTS',
] as const;

export type EvaluationsMetricCategory = (typeof EVALUATIONS_METRIC_CATEGORIES)[number];

export const EVALUATIONS_METRIC_KINDS = [
  'OBSERVED',
  'DERIVED',
  'RULE_BASED_ESTIMATE',
  'STATISTICAL_FORECAST',
  'ML_FORECAST',
] as const;

export type EvaluationsMetricKind = (typeof EVALUATIONS_METRIC_KINDS)[number];

export const EVALUATIONS_METRIC_UNITS = [
  'EUR',
  'EUR_CENTS',
  'PERCENT',
  'COUNT',
  'MINUTES',
  'DAYS',
  'MILLISECONDS',
  'SCORE',
  'ENUM',
  'TEXT',
  'DATETIME',
  'MIXED',
  'NONE',
] as const;

export type EvaluationsMetricUnit = (typeof EVALUATIONS_METRIC_UNITS)[number];

export const EVALUATIONS_VALUE_TYPES = [
  'MONEY',
  'NUMBER',
  'PERCENT',
  'COUNT',
  'RATIO',
  'DURATION_MINUTES',
  'DURATION_DAYS',
  'DURATION_MILLISECONDS',
  'DATETIME',
  'ENUM',
  'SCORE',
  'TEXT',
  'LIST',
  'BOOLEAN',
] as const;

export type EvaluationsValueType = (typeof EVALUATIONS_VALUE_TYPES)[number];

export const EVALUATIONS_AGGREGATION_TYPES = [
  'SUM',
  'COUNT',
  'AVG',
  'RATIO',
  'MAX',
  'MIN',
  'LAST',
  'LIST_TOP_N',
  'STATUS',
] as const;

export type EvaluationsAggregationType = (typeof EVALUATIONS_AGGREGATION_TYPES)[number];

export const EVALUATIONS_DATA_CLASSIFICATIONS = [
  'AGGREGATE',
  'PII_AGGREGATE',
  'PII_ROW',
  'OPERATIONAL_SIGNAL',
  'DIAGNOSTIC',
] as const;

export type EvaluationsDataClassification = (typeof EVALUATIONS_DATA_CLASSIFICATIONS)[number];

export const EVALUATIONS_DIMENSIONS = [
  'organizationId',
  'stationId',
  'vehicleId',
  'customerId',
  'bookingId',
] as const;

export type EvaluationsDimension = (typeof EVALUATIONS_DIMENSIONS)[number];

export const EVALUATIONS_COMPARISONS = ['none', 'mom', 'yoy', 'prev_period'] as const;

export type EvaluationsComparison = (typeof EVALUATIONS_COMPARISONS)[number];

export const EVALUATIONS_IMPLEMENTATION_STATUSES = [
  'active',
  'active_degraded',
  'prepared',
  'planned',
  'deprecated',
] as const;

export type EvaluationsImplementationStatus = (typeof EVALUATIONS_IMPLEMENTATION_STATUSES)[number];

/** Stable registry record — no display strings; labels via i18n keys only. */
export interface EvaluationsMetricDefinition {
  readonly id: string;
  readonly category: EvaluationsMetricCategory;
  readonly labelKey: string;
  readonly descriptionKey: string;
  readonly unit: EvaluationsMetricUnit;
  readonly valueType: EvaluationsValueType;
  readonly aggregationType: EvaluationsAggregationType;
  readonly calculationVersion: string;
  readonly supportedDimensions: readonly EvaluationsDimension[];
  readonly supportedComparisons: readonly EvaluationsComparison[];
  readonly dataClassification: EvaluationsDataClassification;
  readonly metricKind: EvaluationsMetricKind;
  readonly implementationStatus: EvaluationsImplementationStatus;
  /** When set, this id is a deprecated alias — do not use in new code. */
  readonly supersededBy?: string;
}

export interface EvaluationsMetricRegistrySnapshot {
  readonly taxonomyVersion: string;
  readonly registryVersion: string;
  readonly metrics: readonly EvaluationsMetricDefinition[];
}
