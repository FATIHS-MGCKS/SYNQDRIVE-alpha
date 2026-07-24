import type { OrgReportingCurrencySource } from './fx.contract';

export interface OrgReportingCurrencyInput {
  /** Explicit org setting when available (future Organization.reportingCurrency). */
  organizationReportingCurrency?: string | null;
  paymentAccountDefaultCurrency?: string | null;
  primaryPriceBookCurrency?: string | null;
  /** Platform fallback when org has no configured currency — not applied to documents. */
  platformDefaultCurrency?: string;
}

export interface OrgReportingCurrencyResolution {
  currency: string | null;
  source: OrgReportingCurrencySource | 'unconfigured';
}

function normalizeOrgCurrency(currency: string | null | undefined): string | null {
  if (currency == null) return null;
  const trimmed = currency.trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase();
}

/**
 * Resolve organization reporting (base) currency for Auswertungen.
 * Document currencies must never be inferred here — only org-level configuration.
 */
export function resolveOrgReportingCurrency(
  input: OrgReportingCurrencyInput,
): OrgReportingCurrencyResolution {
  const explicit = normalizeOrgCurrency(input.organizationReportingCurrency);
  if (explicit) {
    return { currency: explicit, source: 'organization_explicit' };
  }

  const payment = normalizeOrgCurrency(input.paymentAccountDefaultCurrency);
  if (payment) {
    return { currency: payment, source: 'payment_account_default' };
  }

  const priceBook = normalizeOrgCurrency(input.primaryPriceBookCurrency);
  if (priceBook) {
    return { currency: priceBook, source: 'price_book_primary' };
  }

  const platform = normalizeOrgCurrency(input.platformDefaultCurrency ?? 'EUR');
  if (platform) {
    return { currency: platform, source: 'platform_default' };
  }

  return { currency: null, source: 'unconfigured' };
}
