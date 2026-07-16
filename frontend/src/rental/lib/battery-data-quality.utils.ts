import type { BatteryDataQualityStatus } from './battery-data-quality';

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
  t: (key: string) => string,
): string {
  if (!status) return t('health.battery.dataQuality.UNAVAILABLE');
  return t(`health.battery.dataQuality.${status}`);
}

export function batteryDataQualityShortLabel(
  status: BatteryDataQualityStatus | null | undefined,
  t: (key: string) => string,
): string {
  if (!status) return t('health.battery.dataQuality.short.UNAVAILABLE');
  return t(`health.battery.dataQuality.short.${status}`);
}

export function batteryLoadErrorLabel(t: (key: string) => string): string {
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
