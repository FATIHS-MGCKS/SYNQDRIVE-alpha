/** Resolve BCP-47 locale for dashboard currency formatting. */
export function resolveDashboardNumberFormatLocale(locale: string, currency: string): string {
  const normalized = (locale || '').trim().toLowerCase().replace(/_/g, '-');
  if (normalized.startsWith('de')) return 'de-DE';
  if (normalized.startsWith('en')) return 'en-US';
  if (currency === 'EUR') return 'de-DE';
  return locale || 'en-US';
}

export function formatDashboardMoney(cents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(resolveDashboardNumberFormatLocale(locale, currency), {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
