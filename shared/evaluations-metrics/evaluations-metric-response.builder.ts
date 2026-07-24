import type { EvaluationsMetricUnit } from './evaluations-metric.contract';
import type {
  EvaluationsMetricComparison,
  EvaluationsMetricDataCoverage,
  EvaluationsMetricPeriodRef,
  EvaluationsMetricResponse,
  EvaluationsMetricSourceFreshness,
  EvaluationsMetricStatus,
} from './evaluations-metric-response.contract';
import { assertValidEvaluationsMetricResponse } from './evaluations-metric-response.validator';

export interface BuildMetricResponseBase {
  metricId: string;
  unit: EvaluationsMetricUnit;
  currency?: string | null;
  generatedAt: Date;
  period: EvaluationsMetricPeriodRef;
  calculationVersion: string;
  comparison?: EvaluationsMetricComparison | null;
  dataCoverage?: EvaluationsMetricDataCoverage | null;
  sourceFreshness?: EvaluationsMetricSourceFreshness | null;
  exclusions?: readonly string[];
  warnings?: readonly string[];
}

function finalize(
  status: EvaluationsMetricStatus,
  value: number | string | boolean | null,
  base: BuildMetricResponseBase,
): EvaluationsMetricResponse {
  const response: EvaluationsMetricResponse = {
    metricId: base.metricId,
    value,
    unit: base.unit,
    currency: base.currency ?? null,
    status,
    generatedAt: base.generatedAt.toISOString(),
    period: base.period,
    comparison: base.comparison ?? null,
    dataCoverage: base.dataCoverage ?? null,
    sourceFreshness: base.sourceFreshness ?? null,
    calculationVersion: base.calculationVersion,
    exclusions: base.exclusions ?? [],
    warnings: base.warnings ?? [],
  };
  assertValidEvaluationsMetricResponse(response);
  return response;
}

/** Legitimate zero is allowed — use for real zero measurements. */
export function buildAvailableMetric(
  base: BuildMetricResponseBase & { value: number | string | boolean },
): EvaluationsMetricResponse {
  return finalize('AVAILABLE', base.value, base);
}

export function buildPartialMetric(
  base: BuildMetricResponseBase & {
    value: number | string | boolean;
    dataCoverage: EvaluationsMetricDataCoverage;
  },
): EvaluationsMetricResponse {
  return finalize('PARTIAL', base.value, base);
}

export function buildStaleMetric(
  base: BuildMetricResponseBase & {
    value: number | string | boolean;
    sourceFreshness: EvaluationsMetricSourceFreshness;
  },
): EvaluationsMetricResponse {
  return finalize('STALE', base.value, base);
}

/** Data source missing or insufficient — distinct from NOT_APPLICABLE. */
export function buildUnavailableMetric(
  base: BuildMetricResponseBase & { reason: string },
): EvaluationsMetricResponse {
  return finalize('UNAVAILABLE', null, {
    ...base,
    warnings: [...(base.warnings ?? []), base.reason],
  });
}

/** Computation failed — never emit 0 as placeholder. */
export function buildErrorMetric(
  base: BuildMetricResponseBase & { error: string },
): EvaluationsMetricResponse {
  return finalize('ERROR', null, {
    ...base,
    warnings: [...(base.warnings ?? []), base.error],
  });
}

/** Metric does not apply in this business context (e.g. no EV fleet for battery KPI). */
export function buildNotApplicableMetric(
  base: BuildMetricResponseBase & { reason: string },
): EvaluationsMetricResponse {
  return finalize('NOT_APPLICABLE', null, {
    ...base,
    warnings: [...(base.warnings ?? []), base.reason],
  });
}

export function buildComparison(input: {
  type: EvaluationsMetricComparison['type'];
  currentValue: number;
  priorValue: number | null;
  priorStatus?: EvaluationsMetricStatus;
}): EvaluationsMetricComparison | null {
  if (input.type === 'none') return null;
  if (input.priorValue == null) {
    return {
      type: input.type,
      priorValue: null,
      deltaAbs: null,
      deltaPct: null,
      status: input.priorStatus ?? 'UNAVAILABLE',
    };
  }
  const deltaAbs = input.currentValue - input.priorValue;
  const deltaPct =
    input.priorValue !== 0 ? (deltaAbs / input.priorValue) * 100 : null;
  return {
    type: input.type,
    priorValue: input.priorValue,
    deltaAbs,
    deltaPct,
    status: 'AVAILABLE',
  };
}
