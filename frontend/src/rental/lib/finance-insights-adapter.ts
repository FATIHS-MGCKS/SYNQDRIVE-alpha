/**
 * Canonical E3 finance insights adapter (presentation boundary).
 *
 * Reads the backend-authoritative finance bundle and exposes typed, status-aware
 * accessors for the UI. It performs NO business calculation — no summing,
 * periodisation, currency filtering, classification, or margin math. The backend
 * is the single authority; this module only selects and formats.
 */
import type {
  EvaluationsMetricResponse,
  EvaluationsMetricStatus,
  EvaluationsMoney,
} from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import type { FinancialInsightsBundleDto } from './finance-insights.types';

export type FinanceMetricStatus = EvaluationsMetricStatus | 'MISSING';

export interface FinanceMoneyView {
  readonly status: FinanceMetricStatus;
  /** Present only when status is value-bearing (AVAILABLE/PARTIAL/STALE). */
  readonly amountMinor: number | null;
  readonly currency: string | null;
  readonly reason: string | null;
}

export interface FinancePercentView {
  readonly status: FinanceMetricStatus;
  readonly value: number | null;
  readonly reason: string | null;
}

const VALUE_BEARING = new Set<EvaluationsMetricStatus>(['AVAILABLE', 'PARTIAL', 'STALE']);

function getMetric(
  bundle: FinancialInsightsBundleDto | null,
  metricId: string,
): EvaluationsMetricResponse | null {
  return bundle?.metrics?.[metricId] ?? null;
}

function firstReason(metric: EvaluationsMetricResponse | null): string | null {
  if (!metric) return null;
  return metric.warnings?.[0] ?? null;
}

/** Read a MONEY metric with its status; never fabricates a value/currency. */
export function readMoneyMetric(
  bundle: FinancialInsightsBundleDto | null,
  metricId: string,
): FinanceMoneyView {
  const metric = getMetric(bundle, metricId);
  if (!metric) {
    return { status: 'MISSING', amountMinor: null, currency: null, reason: null };
  }
  if (VALUE_BEARING.has(metric.status) && metric.value && typeof metric.value === 'object') {
    const money = metric.value as EvaluationsMoney;
    return {
      status: metric.status,
      amountMinor: money.amountMinor,
      currency: money.currency,
      reason: null,
    };
  }
  return { status: metric.status, amountMinor: null, currency: null, reason: firstReason(metric) };
}

/** Read a SIGNED_PERCENT/PERCENT metric with its status (may be negative). */
export function readPercentMetric(
  bundle: FinancialInsightsBundleDto | null,
  metricId: string,
): FinancePercentView {
  const metric = getMetric(bundle, metricId);
  if (!metric) return { status: 'MISSING', value: null, reason: null };
  if (VALUE_BEARING.has(metric.status) && typeof metric.value === 'number') {
    return { status: metric.status, value: metric.value, reason: null };
  }
  return { status: metric.status, value: null, reason: firstReason(metric) };
}

export function isMoneyAvailable(view: FinanceMoneyView): boolean {
  return VALUE_BEARING.has(view.status as EvaluationsMetricStatus) && view.amountMinor !== null;
}

export function isPercentAvailable(view: FinancePercentView): boolean {
  return VALUE_BEARING.has(view.status as EvaluationsMetricStatus) && view.value !== null;
}

/**
 * Format a canonical money view for display. Uses the backend Money.currency (no
 * hardcoded EUR). Non-value states render a status label, never a false zero.
 */
export function formatFinanceMoney(
  view: FinanceMoneyView,
  locale: string,
  opts: { maximumFractionDigits?: number; minimumFractionDigits?: number } = {},
): string {
  if (!isMoneyAvailable(view) || view.amountMinor === null || !view.currency) {
    return financeUnavailableLabel(view.status);
  }
  // Presentation-only division to major units for locale formatting.
  const major = view.amountMinor / 100;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: view.currency,
    maximumFractionDigits: opts.maximumFractionDigits ?? 2,
    minimumFractionDigits: opts.minimumFractionDigits,
  }).format(major);
}

export function formatFinancePercent(view: FinancePercentView, digits = 1): string {
  if (!isPercentAvailable(view) || view.value === null) {
    return view.status === 'NOT_APPLICABLE' ? 'n/a' : financeUnavailableLabel(view.status);
  }
  return `${view.value.toFixed(digits)}%`;
}

export function financeUnavailableLabel(status: FinanceMetricStatus): string {
  switch (status) {
    case 'NOT_APPLICABLE':
      return 'n/a';
    case 'ERROR':
      return 'Fehler';
    case 'PARTIAL':
      return 'unvollständig';
    case 'STALE':
      return 'veraltet';
    default:
      return '—';
  }
}
