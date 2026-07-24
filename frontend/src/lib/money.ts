/**
 * Frontend money helpers — display formatting and shared domain utilities.
 * Source of truth: shared/money/
 */
import {
  formatMoney,
  formatMoneyMajorUnits as formatMoneyMajorUnitsShared,
  formatMoneyMinor,
  tryNormalizeCurrencyCode,
} from '@synq/money/money.format';
import { minorToMajorDisplayValue } from '@synq/money/money.util';

export type { Money } from '@synq/money/money.contract';
export { MoneyDomainError } from '@synq/money/money.contract';

export {
  currencyMinorDecimals,
  minorUnitScale,
} from '@synq/money/currency-decimals';

export {
  absMoney,
  addMoney,
  assertSameCurrency,
  compareMoney,
  majorUnitsStringToMinor,
  minorToMajorDisplayValue,
  minorToWholeMajorUnits,
  moneyFromMinor,
  subtractMoney,
  sumMoney,
  zeroMoney,
} from '@synq/money/money.util';

export {
  legacyInsightFinancialImpactWholeMajor,
  resolveLegacyInsightFinancialImpact,
} from '@synq/money/money.legacy-insight';

export { formatMoney, formatMoneyMinor };

export const DEFAULT_MONEY_LOCALE = 'de-DE';

/** Lenient ISO-4217 normalization for UI — returns null when invalid. */
export function normalizeCurrencyCode(input: string | null | undefined): string | null {
  return tryNormalizeCurrencyCode(input);
}

/**
 * Canonical pricing currency: simulation result first, then active price book.
 * Returns null when neither source provides a valid ISO-4217 code.
 */
export function resolvePricingCurrency(
  simulation?: { currency?: string | null } | null,
  priceBook?: { currency?: string | null } | null,
): string | null {
  return (
    normalizeCurrencyCode(simulation?.currency ?? null) ??
    normalizeCurrencyCode(priceBook?.currency ?? null)
  );
}

/** Format integer minor units for display — no FX conversion. */
export function formatMoneyCents(
  cents: number | null | undefined,
  currency: string,
  locale: string = DEFAULT_MONEY_LOCALE,
): string {
  return formatMoneyMinor(cents, currency, locale);
}

/**
 * @deprecated Use minorToMajorDisplayValue for display-only reads, or keep amounts in minor units.
 * Returns major units via display ratio — not for business arithmetic.
 */
export function majorUnitsFromCents(
  cents: number | null | undefined,
  currency = 'EUR',
): number | null {
  if (cents == null || Number.isNaN(cents)) return null;
  return minorToMajorDisplayValue(cents, currency);
}

/** @deprecated Use formatMoneyMinor with minor units directly. */
export function formatMoneyMajorUnits(
  majorUnits: number | null | undefined,
  currency: string,
  locale: string = DEFAULT_MONEY_LOCALE,
): string {
  return formatMoneyMajorUnitsShared(majorUnits, currency, locale);
}
