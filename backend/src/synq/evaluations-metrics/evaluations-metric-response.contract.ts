import type {
  EvaluationsMetricKind,
  EvaluationsMetricUnit,
  EvaluationsValueType,
} from './evaluations-metric.contract';
import type {
  EvaluationsComparisonType,
  EvaluationsPeriodWindow,
} from '@synq/evaluations-periods/evaluations-period.contract';

export const EVALUATIONS_METRIC_RESPONSE_SCHEMA_VERSION = '1.0.0' as const;

export const EVALUATIONS_METRIC_STATUSES = [
  'AVAILABLE',
  'PARTIAL',
  'STALE',
  'UNAVAILABLE',
  'ERROR',
  'NOT_APPLICABLE',
] as const;

export type EvaluationsMetricStatus = (typeof EVALUATIONS_METRIC_STATUSES)[number];

export const EVALUATIONS_SOURCE_FRESHNESS_STATES = [
  'FRESH',
  'STALE',
  'UNKNOWN',
  'ERROR',
] as const;

export type EvaluationsSourceFreshnessState =
  (typeof EVALUATIONS_SOURCE_FRESHNESS_STATES)[number];

/** E1 foundation only; conversion and FX provenance belong to E3. */
export interface EvaluationsMoney {
  readonly amountMinor: number;
  readonly currency: string;
}

export interface EvaluationsDataCoverage {
  readonly expectedRecords: number | null;
  readonly availableRecords: number | null;
  readonly excludedRecords: number | null;
  /** Available/expected ratio in the closed interval [0, 1], when known. */
  readonly ratio: number | null;
  readonly missingSources: readonly string[];
}

export interface EvaluationsSourceFreshness {
  readonly newestSourceAt: string | null;
  readonly oldestSourceAt: string | null;
  readonly lastSuccessfulImportAt: string | null;
  readonly evaluatedAt: string;
  readonly state: EvaluationsSourceFreshnessState;
}

export interface EvaluationsMetricComparison {
  readonly comparisonType: EvaluationsComparisonType;
  readonly currentPeriod: EvaluationsPeriodWindow;
  readonly comparisonPeriod: EvaluationsPeriodWindow;
  readonly absoluteDelta: number | null;
  /** Null for a zero or unavailable baseline; never Infinity/NaN. */
  readonly percentageDelta: number | null;
  readonly status: EvaluationsMetricStatus;
}

interface EvaluationsMetricResponseBase {
  readonly schemaVersion: typeof EVALUATIONS_METRIC_RESPONSE_SCHEMA_VERSION;
  readonly metricId: string;
  readonly metricKind: EvaluationsMetricKind;
  readonly generatedAt: string;
  readonly period: EvaluationsPeriodWindow;
  readonly comparison: EvaluationsMetricComparison | null;
  readonly dataCoverage: EvaluationsDataCoverage | null;
  readonly sourceFreshness: EvaluationsSourceFreshness | null;
  readonly calculationVersion: string;
  readonly exclusions: readonly string[];
  readonly warnings: readonly string[];
}

type EvaluationsValueState<T> =
  | {
      readonly status: 'AVAILABLE' | 'PARTIAL' | 'STALE';
      readonly value: T;
    }
  | {
      readonly status: 'UNAVAILABLE' | 'ERROR' | 'NOT_APPLICABLE';
      readonly value: null;
    };

export type EvaluationsScalarMetricValue =
  | number
  | string
  | boolean
  | readonly unknown[];

export type EvaluationsScalarValueType = Exclude<EvaluationsValueType, 'MONEY'>;

export type EvaluationsMoneyMetricResponse = EvaluationsMetricResponseBase & {
  readonly valueType: 'MONEY';
  readonly unit: 'CURRENCY_MINOR';
} & EvaluationsValueState<EvaluationsMoney>;

export type EvaluationsScalarMetricResponse = EvaluationsMetricResponseBase & {
  readonly valueType: EvaluationsScalarValueType;
  readonly unit: Exclude<EvaluationsMetricUnit, 'CURRENCY_MINOR'>;
} & EvaluationsValueState<EvaluationsScalarMetricValue>;

/**
 * Canonical KPI payload. A measured zero remains a non-null value with its own
 * status; unavailable/error/not-applicable values are always null.
 */
export type EvaluationsMetricResponse =
  | EvaluationsMoneyMetricResponse
  | EvaluationsScalarMetricResponse;

export interface EvaluationsMetricResponseBundle {
  readonly schemaVersion: typeof EVALUATIONS_METRIC_RESPONSE_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly metrics: readonly EvaluationsMetricResponse[];
}
