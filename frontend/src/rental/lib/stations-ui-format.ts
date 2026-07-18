/** Locale-aware integer formatting for Stations V2 KPIs and counts. */

export function resolveStationNumberFormatLocale(locale: string | null | undefined): string {
  const normalized = (locale ?? '').trim().toLowerCase().replace(/_/g, '-');
  if (!normalized || normalized.startsWith('de')) return 'de-DE';
  if (normalized.startsWith('en')) return 'en-GB';
  return 'de-DE';
}

export function formatStationCount(value: number, locale: string): string {
  return new Intl.NumberFormat(resolveStationNumberFormatLocale(locale)).format(value);
}

export function formatStationMetricValue(value: number | '—', locale: string): string {
  if (value === '—') return '—';
  return formatStationCount(value, locale);
}
