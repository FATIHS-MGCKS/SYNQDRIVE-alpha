function isIntlLocaleSupported(tag: string): boolean {
  try {
    return Intl.NumberFormat.supportedLocalesOf([tag], { localeMatcher: 'lookup' }).length > 0;
  } catch {
    return false;
  }
}

/** Resolve BCP-47 locale for dashboard currency formatting. */
export function resolveDashboardNumberFormatLocale(
  locale: string | null | undefined,
  currency: string,
): string {
  const trimmed = (locale ?? '').trim();
  const normalized = trimmed.toLowerCase().replace(/_/g, '-');

  if (!normalized) {
    return currency.toUpperCase() === 'EUR' ? 'de-DE' : 'en-US';
  }

  if (normalized.startsWith('de')) return 'de-DE';
  if (normalized.startsWith('en')) return 'en-US';

  const bcp47 = trimmed.replace(/_/g, '-');
  if (bcp47 && isIntlLocaleSupported(bcp47)) {
    return bcp47;
  }
  if (isIntlLocaleSupported(normalized)) {
    return normalized;
  }

  return currency.toUpperCase() === 'EUR' ? 'de-DE' : 'en-US';
}

export function formatDashboardMoney(cents: number, currency: string, locale: string): string {
  const resolvedLocale = resolveDashboardNumberFormatLocale(locale, currency);
  const normalizedCurrency = (currency || 'EUR').toUpperCase();

  return new Intl.NumberFormat(resolvedLocale, {
    style: 'currency',
    currency: normalizedCurrency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** Business Pulse / Finances KPI money formatter (alias for tests and explicit imports). */
export const formatBusinessMoney = formatDashboardMoney;
