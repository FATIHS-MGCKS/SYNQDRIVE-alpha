import type { BatteryDataQualityStatus } from './battery-data-quality';
import type { TranslationKey } from '../i18n/translations/en';

export type BatteryTranslate = (key: TranslationKey) => string;

export type BatteryDataQualityChipTone =
  | 'success'
  | 'info'
  | 'watch'
  | 'neutral'
  | 'critical';

export function batteryDataQualityChipTone(
  status: BatteryDataQualityStatus | null | undefined,
): BatteryDataQualityChipTone {
  switch (status) {
    case 'VERIFIED':
      return 'success';
    case 'ESTIMATED':
      return 'info';
    case 'PROXY':
    case 'EXPERIMENTAL':
      return 'watch';
    case 'STALE':
    case 'MISSED':
      return 'watch';
    case 'UNSUPPORTED':
    case 'UNAVAILABLE':
      return 'neutral';
    case 'LEGACY_UNVERIFIED':
      return 'critical';
    default:
      return 'neutral';
  }
}

export function batteryDataQualityLabel(
  status: BatteryDataQualityStatus | null | undefined,
  t: BatteryTranslate,
): string {
  if (!status) return t('health.battery.dataQuality.UNAVAILABLE');
  return t(`health.battery.dataQuality.${status}` as TranslationKey);
}

export function batteryDataQualityShortLabel(
  status: BatteryDataQualityStatus | null | undefined,
  t: BatteryTranslate,
): string {
  if (!status) return t('health.battery.dataQuality.short.UNAVAILABLE');
  return t(`health.battery.dataQuality.short.${status}` as TranslationKey);
}

export function batteryLoadErrorLabel(t: BatteryTranslate): string {
  return t('health.battery.loadError');
}

const DETAIL_NOTE_DE: Record<BatteryDataQualityStatus, string | null> = {
  VERIFIED: null,
  ESTIMATED: null,
  PROXY: 'Proxy-Messung',
  EXPERIMENTAL: 'Experimentell',
  STALE: 'Veraltet',
  MISSED: 'Messfenster verpasst',
  UNAVAILABLE: 'Nicht verfügbar',
  UNSUPPORTED: 'Nicht unterstützt',
  LEGACY_UNVERIFIED: 'Legacy / unverifiziert',
};

export function batteryDataQualityDetailNoteDe(
  status: BatteryDataQualityStatus | null | undefined,
): string | null {
  if (!status) return null;
  return DETAIL_NOTE_DE[status] ?? null;
}
