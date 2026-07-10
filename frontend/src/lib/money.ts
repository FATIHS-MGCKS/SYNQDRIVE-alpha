export const DEFAULT_MONEY_LOCALE = 'de-DE';

const ISO4217_PATTERN = /^[A-Z]{3}$/;

export function normalizeCurrencyCode(input: string | null | undefined): string | null {
  const trimmed = typeof input === 'string' ? input.trim() : '';
  if (!trimmed) return null;
  const normalized = trimmed.toUpperCase();
  if (!ISO4217_PATTERN.test(normalized)) return null;
  return normalized;
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

export function formatMoneyCents(
  cents: number | null | undefined,
  currency: string,
  locale: string = DEFAULT_MONEY_LOCALE,
): string {
  if (cents == null || Number.isNaN(cents)) return '—';
  const code = normalizeCurrencyCode(currency);
  if (!code) return '—';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${code}`;
  }
}

/** Major currency units (e.g. euros/dollars) from integer cents — no FX conversion. */
export function majorUnitsFromCents(cents: number | null | undefined): number | null {
  if (cents == null || Number.isNaN(cents)) return null;
  return cents / 100;
}

export function formatMoneyMajorUnits(
  majorUnits: number | null | undefined,
  currency: string,
  locale: string = DEFAULT_MONEY_LOCALE,
): string {
  if (majorUnits == null || !Number.isFinite(majorUnits)) return '—';
  return formatMoneyCents(Math.round(majorUnits * 100), currency, locale);
}
