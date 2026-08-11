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
import { getCurrencyMinorUnitExponent } from '@synq/evaluations-finance/evaluations-money';
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

function pow10(exp: number): number {
  let result = 1;
  for (let i = 0; i < exp; i += 1) result *= 10;
  return result;
}

/**
 * Presentation-only conversion of integer minor units to a major-unit number,
 * using the canonical ISO-4217 minor-unit exponent authority (shared
 * `getCurrencyMinorUnitExponent`) — never a hardcoded /100. This is display
 * formatting, not a finance calculation authority.
 */
export function minorToMajorForPresentation(amountMinor: number, currency: string): number {
  const exponent = getCurrencyMinorUnitExponent(currency);
  return amountMinor / pow10(exponent);
}

/**
 * Format a canonical money view for display. Uses the backend Money.currency (no
 * hardcoded EUR) and the currency's real minor-unit exponent (JPY=0, KWD=3, …).
 * Non-value states render a status label, never a false zero.
 */
export function formatFinanceMoney(
  view: FinanceMoneyView,
  locale: string,
  opts: { maximumFractionDigits?: number; minimumFractionDigits?: number } = {},
): string {
  if (!isMoneyAvailable(view) || view.amountMinor === null || !view.currency) {
    return financeUnavailableLabel(view.status);
  }
  try {
    const major = minorToMajorForPresentation(view.amountMinor, view.currency);
    // When no explicit fraction override is given, let Intl use the currency's
    // own decimal convention (2 for EUR/USD, 0 for JPY, 3 for KWD, …).
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: view.currency,
      ...(opts.maximumFractionDigits !== undefined
        ? { maximumFractionDigits: opts.maximumFractionDigits }
        : {}),
      ...(opts.minimumFractionDigits !== undefined
        ? { minimumFractionDigits: opts.minimumFractionDigits }
        : {}),
    }).format(major);
  } catch {
    // Invalid/unsupported currency → guarded state, never a crash or a /100 guess.
    return financeUnavailableLabel('ERROR');
  }
}

/**
 * Format raw money (an explicit amountMinor + currency, e.g. a source invoice)
 * for display, using the same canonical ISO-4217 exponent authority as
 * `formatFinanceMoney` — never a hardcoded /100 or EUR. Invalid/missing currency
 * yields a guarded label, never an EUR guess. This is presentation only.
 */
export function formatRawMoney(
  amountMinor: number | null | undefined,
  currency: string | null | undefined,
  locale: string,
  opts: { maximumFractionDigits?: number; minimumFractionDigits?: number } = {},
): string {
  if (amountMinor === null || amountMinor === undefined || !currency) {
    return financeUnavailableLabel('UNAVAILABLE');
  }
  try {
    const major = minorToMajorForPresentation(amountMinor, currency);
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      ...(opts.maximumFractionDigits !== undefined
        ? { maximumFractionDigits: opts.maximumFractionDigits }
        : {}),
      ...(opts.minimumFractionDigits !== undefined
        ? { minimumFractionDigits: opts.minimumFractionDigits }
        : {}),
    }).format(major);
  } catch {
    return financeUnavailableLabel('ERROR');
  }
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
