import type {
  EvaluationsMetricKind,
  EvaluationsMetricUnit,
  EvaluationsValueType,
} from './evaluations-metric.contract';
import {
  EVALUATIONS_METRIC_RESPONSE_SCHEMA_VERSION,
  type EvaluationsDataCoverage,
  type EvaluationsMetricComparison,
  type EvaluationsMetricResponse,
  type EvaluationsMetricStatus,
  type EvaluationsMoney,
  type EvaluationsScalarMetricValue,
  type EvaluationsSourceFreshness,
} from './evaluations-metric-response.contract';
import { assertValidEvaluationsMetricResponse } from './evaluations-metric-response.validator';
import type {
  EvaluationsComparisonType,
  EvaluationsPeriodWindow,
} from '@synq/evaluations-periods/evaluations-period.contract';

export interface BuildEvaluationsMetricResponseBase {
  readonly metricId: string;
  readonly metricKind: EvaluationsMetricKind;
  readonly valueType: EvaluationsValueType;
  readonly unit: EvaluationsMetricUnit;
  readonly generatedAt: Date;
  readonly period: EvaluationsPeriodWindow;
  readonly comparison?: EvaluationsMetricComparison | null;
  readonly dataCoverage?: EvaluationsDataCoverage | null;
  readonly sourceFreshness?: EvaluationsSourceFreshness | null;
  readonly calculationVersion: string;
  readonly exclusions?: readonly string[];
  readonly warnings?: readonly string[];
}

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
  base: BuildEvaluationsMetricResponseBase & { readonly value: BuildEvaluationsMetricValue },
): EvaluationsMetricResponse {
  return finalize(base, 'AVAILABLE', base.value);
}

export function buildPartialEvaluationsMetric(
  base: BuildEvaluationsMetricResponseBase & {
    readonly value: BuildEvaluationsMetricValue;
    readonly dataCoverage: EvaluationsDataCoverage;
  },
): EvaluationsMetricResponse {
  return finalize(base, 'PARTIAL', base.value);
}

export function buildStaleEvaluationsMetric(
  base: BuildEvaluationsMetricResponseBase & {
    readonly value: BuildEvaluationsMetricValue;
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

export function buildEvaluationsMetricComparison(input: {
  readonly comparisonType: EvaluationsComparisonType;
  readonly currentPeriod: EvaluationsPeriodWindow;
  readonly comparisonPeriod: EvaluationsPeriodWindow;
  readonly currentValue: number;
  readonly comparisonValue: number | null;
  readonly comparisonStatus?: EvaluationsMetricStatus;
}): EvaluationsMetricComparison {
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
