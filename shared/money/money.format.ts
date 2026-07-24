import { currencyMinorDecimals, minorUnitScale } from './currency-decimals';
import type { Money } from './money.contract';
import { assertValidMinorAmount, normalizeMoneyCurrency } from './money.util';

const ISO4217_PATTERN = /^[A-Z]{3}$/;

/** Lenient ISO-4217 normalization for display paths — returns null when invalid. */
export function tryNormalizeCurrencyCode(input: string | null | undefined): string | null {
  const trimmed = typeof input === 'string' ? input.trim() : '';
  if (!trimmed) return null;
  const normalized = trimmed.toUpperCase();
  if (!ISO4217_PATTERN.test(normalized)) return null;
  return normalized;
}

/**
 * Format minor-unit amount for UI display only.
 * Uses Intl when available; does not perform FX or business rounding.
 */
export function formatMoneyMinor(
  amountMinor: number | null | undefined,
  currency: string,
  locale = 'de-DE',
): string {
  if (amountMinor == null || Number.isNaN(amountMinor)) return '—';
  const code = tryNormalizeCurrencyCode(currency);
  if (!code) return '—';
  try {
    assertValidMinorAmount(amountMinor);
    const decimals = currencyMinorDecimals(code);
    const major = amountMinor / minorUnitScale(code);
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(major);
  } catch {
    return '—';
  }
}

export function formatMoney(value: Money | null | undefined, locale = 'de-DE'): string {
  if (!value) return '—';
  return formatMoneyMinor(value.amountMinor, value.currency, locale);
}

/**
 * @deprecated Prefer formatMoneyMinor — accepts major units and rounds to minor internally.
 * Kept for legacy pricing forms that still capture major-unit numbers.
 */
export function formatMoneyMajorUnits(
  majorUnits: number | null | undefined,
  currency: string,
  locale = 'de-DE',
): string {
  if (majorUnits == null || !Number.isFinite(majorUnits)) return '—';
  const code = tryNormalizeCurrencyCode(currency);
  if (!code) return '—';
  const scale = minorUnitScale(code);
  const minor = Math.round(majorUnits * scale);
  return formatMoneyMinor(minor, code, locale);
}
