import type { EvaluationsMetricKind } from '@synq/evaluations-metrics/evaluations-metric.contract';
import type {
  EvaluationsMetricResponse,
  EvaluationsMoney,
} from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import type { EvaluationsPeriodWindow } from '@synq/evaluations-periods/evaluations-period.contract';
import {
  buildAvailableEvaluationsMetric,
  buildNotApplicableEvaluationsMetric,
  buildUnavailableEvaluationsMetric,
} from '@synq/evaluations-metrics/evaluations-metric-response.builder';
import type { EvaluationsFinanceAggregate } from '@synq/evaluations-finance/evaluations-finance-calculator';
import type { EvaluationsProfitMargin } from '@synq/evaluations-finance/evaluations-finance-calculator';

/**
 * Maps a currency-safe finance aggregate onto the E1 money metric contract while
 * preserving E1 status semantics:
 *   - Source unavailable            → UNAVAILABLE (never a fabricated zero).
 *   - Multiple currencies, no report → UNAVAILABLE (no mixed-currency total).
 *   - Empty period, currency known   → AVAILABLE Money(0, reportingCurrency).
 *   - Empty period, no currency      → UNAVAILABLE (currency authority missing).
 *   - Exactly one currency           → AVAILABLE Money(total).
 */
export interface FinanceMoneyMetricInput {
  readonly metricId: string;
  readonly metricKind: EvaluationsMetricKind;
  readonly calculationVersion: string;
  readonly period: EvaluationsPeriodWindow;
  readonly generatedAt: Date;
  readonly aggregate: EvaluationsFinanceAggregate;
  readonly sourceAvailable: boolean;
  /** Authoritative org reporting currency (org settings), or null when unknown. */
  readonly reportingCurrency: string | null;
}

function moneyBase(input: FinanceMoneyMetricInput) {
  return {
    metricId: input.metricId,
    metricKind: input.metricKind,
    valueType: 'MONEY' as const,
    unit: 'CURRENCY_MINOR' as const,
    calculationVersion: input.calculationVersion,
    period: input.period,
    generatedAt: input.generatedAt,
  };
}

export function mapFinanceMoneyMetric(
  input: FinanceMoneyMetricInput,
): EvaluationsMetricResponse {
  const base = moneyBase(input);
  if (!input.sourceAvailable) {
    return buildUnavailableEvaluationsMetric({ ...base, reason: 'FINANCE_SOURCE_UNAVAILABLE' });
  }
  const { perCurrency } = input.aggregate;
  if (perCurrency.length > 1) {
    return buildUnavailableEvaluationsMetric({
      ...base,
      reason: 'MIXED_CURRENCY_NO_REPORTING_AUTHORITY',
    });
  }
  if (perCurrency.length === 1) {
    return buildAvailableEvaluationsMetric({ ...base, value: perCurrency[0] });
  }
  if (input.reportingCurrency) {
    const zero: EvaluationsMoney = { amountMinor: 0, currency: input.reportingCurrency };
    return buildAvailableEvaluationsMetric({ ...base, value: zero });
  }
  return buildUnavailableEvaluationsMetric({
    ...base,
    reason: 'NO_ORGANIZATION_CURRENCY_AUTHORITY',
  });
}

export interface FinanceMarginMetricInput {
  readonly metricId: string;
  readonly metricKind: EvaluationsMetricKind;
  readonly calculationVersion: string;
  readonly period: EvaluationsPeriodWindow;
  readonly generatedAt: Date;
  readonly margin: EvaluationsProfitMargin;
  readonly sourceAvailable: boolean;
}

export function mapFinanceMarginMetric(
  input: FinanceMarginMetricInput,
): EvaluationsMetricResponse {
  const base = {
    metricId: input.metricId,
    metricKind: input.metricKind,
    valueType: 'PERCENT' as const,
    unit: 'PERCENT' as const,
    calculationVersion: input.calculationVersion,
    period: input.period,
    generatedAt: input.generatedAt,
  };
  if (!input.sourceAvailable) {
    return buildUnavailableEvaluationsMetric({ ...base, reason: 'FINANCE_SOURCE_UNAVAILABLE' });
  }
  if (input.margin.kind === 'NOT_APPLICABLE') {
    return buildNotApplicableEvaluationsMetric({ ...base, reason: input.margin.reason });
  }
  // PERCENT metric values are bounded to [0, 100] by the E1 validator. A margin
  // outside that band cannot be expressed on this contract → NOT_APPLICABLE.
  if (input.margin.value < 0 || input.margin.value > 100) {
    return buildNotApplicableEvaluationsMetric({ ...base, reason: 'MARGIN_OUT_OF_PERCENT_RANGE' });
  }
  return buildAvailableEvaluationsMetric({ ...base, value: input.margin.value });
}
