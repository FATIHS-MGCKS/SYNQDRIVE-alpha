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
  const normalizedCurrency = (currency || 'EUR').toUpperCase();

  // SynqDrive finance KPIs use EUR; European convention is symbol after amount (0 €).
  if (normalizedCurrency === 'EUR') {
    return 'de-DE';
  }

  const trimmed = (locale ?? '').trim();
  const normalized = trimmed.toLowerCase().replace(/_/g, '-');

  if (!normalized) {
    return 'en-US';
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

  return 'en-US';
}

export function formatDashboardMoney(cents: number, currency: string, locale: string): string {
  const { amount, currency: currencySymbol } = formatDashboardMoneyParts(cents, currency, locale);
  return `${amount}\u00a0${currencySymbol}`;
}

export interface DashboardMoneyParts {
  amount: string;
  currency: string;
}

/** Split money for KPI display — amount uses number class, currency uses suffix class. */
export function formatDashboardMoneyParts(
  cents: number,
  currency: string,
  locale: string,
): DashboardMoneyParts {
  const resolvedLocale = resolveDashboardNumberFormatLocale(locale, currency);
  const normalizedCurrency = (currency || 'EUR').toUpperCase();

  const parts = new Intl.NumberFormat(resolvedLocale, {
    style: 'currency',
    currency: normalizedCurrency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).formatToParts(cents / 100);

  const currencySymbol = parts.find((part) => part.type === 'currency')?.value ?? normalizedCurrency;
  const amount = parts
    .filter((part) => part.type !== 'currency')
    .map((part) => part.value)
    .join('')
    .trim();

  return { amount, currency: currencySymbol };
}

/** Business Pulse / Finances KPI money formatter (alias for tests and explicit imports). */
export const formatBusinessMoney = formatDashboardMoney;
