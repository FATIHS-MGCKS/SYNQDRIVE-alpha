/**
 * E6A canonical Money display formatter (presentation only).
 *
 * This is the single generic Money renderer for the Evaluations (Auswertungen) UI.
 * It NEVER performs business arithmetic, NEVER infers currency from locale, NEVER
 * defaults to EUR, and NEVER sums mixed currencies. Currency always comes from the
 * canonical contract (`EvaluationsMoney.currency`); the amount is integer minor
 * units converted to major units using the canonical ISO-4217 minor-unit exponent
 * authority (JPY=0, KWD=3, …) — never a hardcoded `/100`.
 *
 * Provenance: reuses the shared money authority
 * `@synq/evaluations-finance/evaluations-money` (same source the E3
 * finance-insights-adapter uses) — no divergent local exponent table.
 */
import { getCurrencyMinorUnitExponent } from '@synq/evaluations-finance/evaluations-money';
import type {
  EvaluationsMoney,
  EvaluationsMetricStatus,
} from '@synq/evaluations-metrics/evaluations-metric-response.contract';

export interface FormatMoneyInput {
  readonly amountMinor: number;
  /** ISO-4217 code from the canonical contract. Required — never defaulted. */
  readonly currency: string;
  /** Display locale only; controls grouping/decimal style, NOT the currency. */
  readonly locale: string;
  readonly maximumFractionDigits?: number;
  readonly minimumFractionDigits?: number;
}

/** Presentation-only minor→major conversion via the canonical exponent authority. */
export function minorToMajor(amountMinor: number, currency: string): number {
  const exponent = getCurrencyMinorUnitExponent(currency);
  return amountMinor / 10 ** exponent;
}

/**
 * Format an explicit `{ amountMinor, currency, locale }` money value. Returns
 * `null` when the currency is missing/invalid (caller renders a guarded label) —
 * never an EUR guess, never a `/100` fallback.
 */
export function formatCanonicalMoney(input: FormatMoneyInput): string | null {
  const currency = input.currency?.trim();
  if (!currency) return null;
  try {
    const major = minorToMajor(input.amountMinor, currency);
    return new Intl.NumberFormat(input.locale, {
      style: 'currency',
      currency,
      ...(input.maximumFractionDigits !== undefined
        ? { maximumFractionDigits: input.maximumFractionDigits }
        : {}),
      ...(input.minimumFractionDigits !== undefined
        ? { minimumFractionDigits: input.minimumFractionDigits }
        : {}),
    }).format(major);
  } catch {
    // Invalid/unsupported ISO currency → guarded null, never a crash or EUR guess.
    return null;
  }
}

/**
 * Format a canonical `EvaluationsMoney` value. Returns `null` when the money or its
 * currency is absent (no silent zero, no EUR default).
 */
export function formatEvaluationsMoney(
  money: EvaluationsMoney | null | undefined,
  locale: string,
): string | null {
  if (!money || money.currency == null || money.amountMinor == null) return null;
  return formatCanonicalMoney({ amountMinor: money.amountMinor, currency: money.currency, locale });
}

/**
 * Status-aware money view for a metric-bearing field. Value-bearing statuses
 * (AVAILABLE/PARTIAL/STALE) may show the amount; no-value statuses
 * (UNAVAILABLE/ERROR/NOT_APPLICABLE) never show a fabricated 0.
 */
export const EVALUATIONS_MONEY_VALUE_BEARING: ReadonlySet<EvaluationsMetricStatus> = new Set([
  'AVAILABLE',
  'PARTIAL',
  'STALE',
]);

export function isMoneyValueBearing(status: EvaluationsMetricStatus): boolean {
  return EVALUATIONS_MONEY_VALUE_BEARING.has(status);
}

/**
 * Mixed-currency guard: E6 must NEVER sum across currencies. Given a set of
 * per-currency totals, this returns them unchanged and flags whether more than one
 * currency is present. It intentionally provides no "grand total" across currencies.
 */
export function partitionByCurrency(
  totals: readonly EvaluationsMoney[],
): { readonly totalsByCurrency: readonly EvaluationsMoney[]; readonly mixedCurrency: boolean } {
  const currencies = new Set(totals.map((m) => m.currency));
  return { totalsByCurrency: totals, mixedCurrency: currencies.size > 1 };
}
