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

/**
 * E1 foundation only; conversion and FX provenance belong to E3.
 * `currency` is the sole currency authority for this concrete value.
 */
export interface EvaluationsMoney {
  readonly amountMinor: number;
  readonly currency: string;
}

export interface EvaluationsDataCoverage {
  readonly expectedRecords: number | null;
  readonly availableRecords: number | null;
  readonly excludedRecords: number | null;
  /**
   * Available/expected ratio in [0, 1]. It must match the record counts when
   * present and is null for the explicit 0 expected / 0 available case.
   */
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

interface EvaluationsMetricComparisonBase {
  readonly comparisonType: EvaluationsComparisonType;
  readonly currentPeriod: EvaluationsPeriodWindow;
  readonly comparisonPeriod: EvaluationsPeriodWindow;
}

export type EvaluationsMetricValueStatus = 'AVAILABLE' | 'PARTIAL' | 'STALE';
export type EvaluationsMetricNoValueStatus =
  | 'UNAVAILABLE'
  | 'ERROR'
  | 'NOT_APPLICABLE';

type EvaluationsMetricComparisonValueState =
  | {
      readonly status: EvaluationsMetricValueStatus;
      readonly absoluteDelta: number;
      /** Null only when the comparison baseline is zero. */
      readonly percentageDelta: number | null;
    }
  | {
      readonly status: EvaluationsMetricNoValueStatus;
      readonly absoluteDelta: null;
      readonly percentageDelta: null;
    };

export type EvaluationsMetricComparison = EvaluationsMetricComparisonBase &
  EvaluationsMetricComparisonValueState;

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
      readonly status: EvaluationsMetricValueStatus;
      readonly value: T;
    }
  | {
      readonly status: EvaluationsMetricNoValueStatus;
      readonly value: null;
    };

export type EvaluationsNumericValueType =
  | 'NUMBER'
  | 'PERCENT'
  | 'COUNT'
  | 'RATIO'
  | 'RATE'
  | 'DISTANCE_KILOMETERS'
  | 'DURATION_SECONDS'
  | 'DURATION_MINUTES'
  | 'DURATION_HOURS'
  | 'DURATION_DAYS'
  | 'DURATION_MILLISECONDS'
  | 'SCORE';

export type EvaluationsStringValueType = 'DATETIME' | 'ENUM' | 'TEXT';

export type EvaluationsScalarMetricValue =
  | number
  | string
  | boolean
  | readonly unknown[];

export type EvaluationsScalarValueType = Exclude<EvaluationsValueType, 'MONEY'>;
export type EvaluationsNonMoneyMetricUnit = Exclude<
  EvaluationsMetricUnit,
  'CURRENCY_MINOR'
>;

export type EvaluationsMoneyMetricResponse = EvaluationsMetricResponseBase & {
  readonly valueType: 'MONEY';
  readonly unit: 'CURRENCY_MINOR';
} & EvaluationsValueState<EvaluationsMoney>;

export type EvaluationsNumericMetricResponse = EvaluationsMetricResponseBase & {
  readonly valueType: EvaluationsNumericValueType;
  readonly unit: EvaluationsNonMoneyMetricUnit;
} & EvaluationsValueState<number>;

export type EvaluationsStringMetricResponse = EvaluationsMetricResponseBase & {
  readonly valueType: EvaluationsStringValueType;
  readonly unit: EvaluationsNonMoneyMetricUnit;
} & EvaluationsValueState<string>;

export type EvaluationsListMetricResponse = EvaluationsMetricResponseBase & {
  readonly valueType: 'LIST';
  readonly unit: EvaluationsNonMoneyMetricUnit;
} & EvaluationsValueState<readonly unknown[]>;

export type EvaluationsBooleanMetricResponse = EvaluationsMetricResponseBase & {
  readonly valueType: 'BOOLEAN';
  readonly unit: EvaluationsNonMoneyMetricUnit;
} & EvaluationsValueState<boolean>;

export type EvaluationsScalarMetricResponse =
  | EvaluationsNumericMetricResponse
  | EvaluationsStringMetricResponse
  | EvaluationsListMetricResponse
  | EvaluationsBooleanMetricResponse;

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
