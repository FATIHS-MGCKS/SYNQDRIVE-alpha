import type { EvaluationsMetricKind } from './evaluations-metric.contract';
import {
  EVALUATIONS_METRIC_RESPONSE_SCHEMA_VERSION,
  type EvaluationsDataCoverage,
  type EvaluationsMetricComparison,
  type EvaluationsMetricNoValueStatus,
  type EvaluationsMetricResponse,
  type EvaluationsMetricStatus,
  type EvaluationsMetricValueStatus,
  type EvaluationsMoney,
  type EvaluationsNonMoneyMetricUnit,
  type EvaluationsNumericValueType,
  type EvaluationsScalarMetricValue,
  type EvaluationsSourceFreshness,
  type EvaluationsStringValueType,
} from './evaluations-metric-response.contract';
import { assertValidEvaluationsMetricResponse } from './evaluations-metric-response.validator';
import type {
  EvaluationsComparisonType,
  EvaluationsPeriodWindow,
} from '@synq/evaluations-periods/evaluations-period.contract';

interface BuildEvaluationsMetricResponseCommon {
  readonly metricId: string;
  readonly metricKind: EvaluationsMetricKind;
  readonly generatedAt: Date;
  readonly period: EvaluationsPeriodWindow;
  readonly comparison?: EvaluationsMetricComparison | null;
  readonly dataCoverage?: EvaluationsDataCoverage | null;
  readonly sourceFreshness?: EvaluationsSourceFreshness | null;
  readonly calculationVersion: string;
  readonly exclusions?: readonly string[];
  readonly warnings?: readonly string[];
}

type BuildEvaluationsMetricDescriptor =
  | { readonly valueType: 'MONEY'; readonly unit: 'CURRENCY_MINOR' }
  | {
      readonly valueType: EvaluationsNumericValueType;
      readonly unit: EvaluationsNonMoneyMetricUnit;
    }
  | {
      readonly valueType: EvaluationsStringValueType;
      readonly unit: EvaluationsNonMoneyMetricUnit;
    }
  | { readonly valueType: 'LIST'; readonly unit: EvaluationsNonMoneyMetricUnit }
  | { readonly valueType: 'BOOLEAN'; readonly unit: EvaluationsNonMoneyMetricUnit };

export type BuildEvaluationsMetricResponseBase =
  BuildEvaluationsMetricResponseCommon & BuildEvaluationsMetricDescriptor;

export type BuildEvaluationsMetricResponseWithValue =
  BuildEvaluationsMetricResponseCommon &
    (
      | {
          readonly valueType: 'MONEY';
          readonly unit: 'CURRENCY_MINOR';
          readonly value: EvaluationsMoney;
        }
      | {
          readonly valueType: EvaluationsNumericValueType;
          readonly unit: EvaluationsNonMoneyMetricUnit;
          readonly value: number;
        }
      | {
          readonly valueType: EvaluationsStringValueType;
          readonly unit: EvaluationsNonMoneyMetricUnit;
          readonly value: string;
        }
      | {
          readonly valueType: 'LIST';
          readonly unit: EvaluationsNonMoneyMetricUnit;
          readonly value: readonly unknown[];
        }
      | {
          readonly valueType: 'BOOLEAN';
          readonly unit: EvaluationsNonMoneyMetricUnit;
          readonly value: boolean;
        }
    );

export type BuildEvaluationsMetricValue =
  | EvaluationsScalarMetricValue
  | EvaluationsMoney;

function finalize(
  base: BuildEvaluationsMetricResponseBase,
  status: EvaluationsMetricStatus,
  value: BuildEvaluationsMetricValue | null,
): EvaluationsMetricResponse {
  const response = {
    schemaVersion: EVALUATIONS_METRIC_RESPONSE_SCHEMA_VERSION,
    metricId: base.metricId,
    metricKind: base.metricKind,
    valueType: base.valueType,
    value,
    unit: base.unit,
    status,
    generatedAt: base.generatedAt.toISOString(),
    period: base.period,
    comparison: base.comparison ?? null,
    dataCoverage: base.dataCoverage ?? null,
    sourceFreshness: base.sourceFreshness ?? null,
    calculationVersion: base.calculationVersion,
    exclusions: base.exclusions ?? [],
    warnings: base.warnings ?? [],
  } as EvaluationsMetricResponse;
  assertValidEvaluationsMetricResponse(response);
  return response;
}

export function buildAvailableEvaluationsMetric(
  base: BuildEvaluationsMetricResponseWithValue,
): EvaluationsMetricResponse {
  return finalize(base, 'AVAILABLE', base.value);
}

export function buildPartialEvaluationsMetric(
  base: BuildEvaluationsMetricResponseWithValue & {
    readonly dataCoverage: EvaluationsDataCoverage;
  },
): EvaluationsMetricResponse {
  return finalize(base, 'PARTIAL', base.value);
}

export function buildStaleEvaluationsMetric(
  base: BuildEvaluationsMetricResponseWithValue & {
    readonly sourceFreshness: EvaluationsSourceFreshness;
  },
): EvaluationsMetricResponse {
  return finalize(base, 'STALE', base.value);
}

function buildNoValueMetric(
  base: BuildEvaluationsMetricResponseBase,
  status: 'UNAVAILABLE' | 'ERROR' | 'NOT_APPLICABLE',
  reason: string,
): EvaluationsMetricResponse {
  return finalize(
    {
      ...base,
      warnings: [...(base.warnings ?? []), reason],
    },
    status,
    null,
  );
}

export function buildUnavailableEvaluationsMetric(
  base: BuildEvaluationsMetricResponseBase & { readonly reason: string },
): EvaluationsMetricResponse {
  return buildNoValueMetric(base, 'UNAVAILABLE', base.reason);
}

export function buildErrorEvaluationsMetric(
  base: BuildEvaluationsMetricResponseBase & { readonly error: string },
): EvaluationsMetricResponse {
  return buildNoValueMetric(base, 'ERROR', base.error);
}

export function buildNotApplicableEvaluationsMetric(
  base: BuildEvaluationsMetricResponseBase & { readonly reason: string },
): EvaluationsMetricResponse {
  return buildNoValueMetric(base, 'NOT_APPLICABLE', base.reason);
}

export type BuildEvaluationsMetricComparisonInput = {
  readonly comparisonType: EvaluationsComparisonType;
  readonly currentPeriod: EvaluationsPeriodWindow;
  readonly comparisonPeriod: EvaluationsPeriodWindow;
  readonly currentValue: number;
} & (
  | {
      readonly comparisonValue: number;
      readonly comparisonStatus?: EvaluationsMetricValueStatus;
    }
  | {
      readonly comparisonValue: null;
      readonly comparisonStatus?: EvaluationsMetricNoValueStatus;
    }
);

export function buildEvaluationsMetricComparison(
  input: BuildEvaluationsMetricComparisonInput,
): EvaluationsMetricComparison {
  if (input.comparisonValue === null) {
    return {
      comparisonType: input.comparisonType,
      currentPeriod: input.currentPeriod,
      comparisonPeriod: input.comparisonPeriod,
      absoluteDelta: null,
      percentageDelta: null,
      status: input.comparisonStatus ?? 'UNAVAILABLE',
    };
  }
  const absoluteDelta = input.currentValue - input.comparisonValue;
  return {
    comparisonType: input.comparisonType,
    currentPeriod: input.currentPeriod,
    comparisonPeriod: input.comparisonPeriod,
    absoluteDelta,
    percentageDelta:
      input.comparisonValue === 0 ? null : (absoluteDelta / input.comparisonValue) * 100,
    status: input.comparisonStatus ?? 'AVAILABLE',
  };
}
