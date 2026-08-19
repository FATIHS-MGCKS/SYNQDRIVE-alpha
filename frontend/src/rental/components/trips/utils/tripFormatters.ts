import {
  DEFAULT_PRODUCT_LOCALE,
  getFormattingLocale,
  isSupportedLocale,
  type SupportedLocale,
} from '../../../../i18n/locales';

function tripFormattingLocale(locale?: SupportedLocale | string): string {
  const code = isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
  return getFormattingLocale(code);
}

export function formatTripTime(iso: string, locale?: SupportedLocale | string): string {
  return new Date(iso).toLocaleTimeString(tripFormattingLocale(locale), { hour: '2-digit', minute: '2-digit' });
}

export function formatTripTimeWithSeconds(iso: string, locale?: SupportedLocale | string): string {
  return new Date(iso).toLocaleTimeString(tripFormattingLocale(locale), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatTripDate(iso: string, locale?: SupportedLocale | string): string {
  return new Date(iso).toLocaleDateString(tripFormattingLocale(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatTripDateLong(iso: string, locale?: SupportedLocale | string): string {
  return new Date(iso).toLocaleDateString(tripFormattingLocale(locale), {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function formatTripDateTime(iso: string, locale?: SupportedLocale | string): string {
  return new Date(iso).toLocaleString(tripFormattingLocale(locale), {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function dateKeyFromIso(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatTripDistance(km: number | null | undefined, locale?: SupportedLocale | string): string {
  if (typeof km !== 'number' || !Number.isFinite(km)) return '—';
  return `${km.toLocaleString(tripFormattingLocale(locale), { maximumFractionDigits: 1 })} km`;
}

export function formatTripDuration(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '—';
  const totalMinutes = Math.round(ms / 60_000);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
}
