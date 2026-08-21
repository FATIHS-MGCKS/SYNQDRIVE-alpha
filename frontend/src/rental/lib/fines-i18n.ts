/**
 * Rental Fines presentation helpers.
 * Machine status/offense values stay unchanged; labels resolve via TranslationKey.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';

/** Persisted offenseType values — never translate for API payloads. */
export const FINE_OFFENSE_TYPE_VALUES = [
  'Geschwindigkeitsüberschreitung',
  'Parkverstoß',
  'Rotlichtverstoß',
  'Mautgebühr',
  'Umweltzonenverstoß',
  'Halteverstoß',
  'Abstandsverstoß',
  'Handyverstoß',
  'Sonstiges',
] as const;

export type FineOffenseTypeValue = (typeof FINE_OFFENSE_TYPE_VALUES)[number];

export const FINE_STATUS_VALUES = [
  'NEW',
  'UNDER_REVIEW',
  'MATCHED',
  'FORWARDED',
  'PENDING_RESPONSE',
  'RESOLVED',
  'CLOSED',
] as const;

export type FineStatusValue = (typeof FINE_STATUS_VALUES)[number];

export const FINE_STATUS_FILTER_OPTIONS = ['all', ...FINE_STATUS_VALUES] as const;

const OFFENSE_TYPE_LABEL_KEYS: Record<FineOffenseTypeValue, TranslationKey> = {
  Geschwindigkeitsüberschreitung: 'fines.offenseType.speeding',
  Parkverstoß: 'fines.offenseType.parking',
  Rotlichtverstoß: 'fines.offenseType.redLight',
  Mautgebühr: 'fines.offenseType.toll',
  Umweltzonenverstoß: 'fines.offenseType.environmentalZone',
  Halteverstoß: 'fines.offenseType.stopping',
  Abstandsverstoß: 'fines.offenseType.distance',
  Handyverstoß: 'fines.offenseType.phone',
  Sonstiges: 'fines.offenseType.other',
};

const FINE_STATUS_LABEL_KEYS: Record<FineStatusValue, TranslationKey> = {
  NEW: 'fines.status.NEW',
  UNDER_REVIEW: 'fines.status.UNDER_REVIEW',
  MATCHED: 'fines.status.MATCHED',
  FORWARDED: 'fines.status.FORWARDED',
  PENDING_RESPONSE: 'fines.status.PENDING_RESPONSE',
  RESOLVED: 'fines.status.RESOLVED',
  CLOSED: 'fines.status.CLOSED',
};

export const FINE_STATUS_STYLES: Record<
  FineStatusValue,
  { bg: string; text: string; dot: string }
> = {
  NEW: { bg: 'bg-status-info-soft', text: 'text-status-info', dot: 'bg-status-info' },
  UNDER_REVIEW: { bg: 'bg-amber-500/15', text: 'text-amber-500', dot: 'bg-amber-500' },
  MATCHED: { bg: 'bg-emerald-500/15', text: 'text-emerald-500', dot: 'bg-emerald-500' },
  FORWARDED: { bg: 'bg-purple-500/15', text: 'text-purple-500', dot: 'bg-purple-500' },
  PENDING_RESPONSE: { bg: 'bg-orange-500/15', text: 'text-orange-500', dot: 'bg-orange-500' },
  RESOLVED: { bg: 'bg-green-500/15', text: 'text-green-600', dot: 'bg-green-600' },
  CLOSED: { bg: 'bg-status-nodata-soft', text: 'text-muted-foreground', dot: 'bg-gray-400' },
};

export function resolveFinesLocale(locale: string | null | undefined): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function fi(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveFinesLocale(locale), key, vars).text;
}

export function finesFormattingLocale(locale: string): string {
  return resolveFinesLocale(locale) === 'de' ? 'de-DE' : 'en-US';
}

export function formatFineDate(locale: string, iso: string | null): string {
  if (!iso) return fi(locale, 'fines.emptyValue');
  return new Date(iso).toLocaleDateString(finesFormattingLocale(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatFineAmount(locale: string, cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat(finesFormattingLocale(locale), {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

export function labelFineStatus(locale: string, status: string): string {
  const key = FINE_STATUS_LABEL_KEYS[status as FineStatusValue] ?? 'fines.status.NEW';
  return fi(locale, key);
}

export function labelFineOffenseType(locale: string, offenseType: string): string {
  if (!offenseType) return fi(locale, 'fines.emptyValue');
  const key =
    OFFENSE_TYPE_LABEL_KEYS[offenseType as FineOffenseTypeValue] ?? 'fines.offenseType.other';
  return fi(locale, key);
}

export function fineStatusStyle(status: string) {
  return FINE_STATUS_STYLES[status as FineStatusValue] ?? FINE_STATUS_STYLES.NEW;
}

export function labelFineTaskStatus(locale: string, status: string): string {
  if (status === 'DONE') return fi(locale, 'tasks.filter.status.DONE');
  if (status === 'IN_PROGRESS') return fi(locale, 'tasks.filter.status.IN_PROGRESS');
  return fi(locale, 'tasks.filter.status.OPEN');
}
