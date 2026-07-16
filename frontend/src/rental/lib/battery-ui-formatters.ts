import type { SohPublicationState } from '../../lib/api';

export type BatteryVoltageContext = 'live' | 'under_load' | 'charging' | 'resting';

export function formatBatteryAgeShort(ageMs: number | null | undefined, locale = 'de-DE'): string | null {
  if (ageMs == null || !Number.isFinite(ageMs) || ageMs < 0) return null;
  if (ageMs < 60_000) return locale.startsWith('de') ? 'vor <1 Min.' : '<1 min ago';
  if (ageMs < 3_600_000) {
    const mins = Math.floor(ageMs / 60_000);
    return locale.startsWith('de') ? `vor ${mins} Min.` : `${mins} min ago`;
  }
  if (ageMs < 86_400_000) {
    const hrs = Math.floor(ageMs / 3_600_000);
    return locale.startsWith('de') ? `vor ${hrs} Std.` : `${hrs} h ago`;
  }
  const days = Math.floor(ageMs / 86_400_000);
  return locale.startsWith('de') ? `vor ${days} Tg.` : `${days} d ago`;
}

export function formatIsoRelative(iso: string | null | undefined, locale = 'de-DE'): string | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return null;
  return formatBatteryAgeShort(Date.now() - ts, locale);
}

export function publicationStateI18nKey(state: SohPublicationState | null | undefined): string {
  switch (state) {
    case 'INITIAL_CALIBRATION':
      return 'health.battery.publication.calibrating';
    case 'STABILIZING':
      return 'health.battery.publication.stabilizing';
    case 'STABLE':
      return 'health.battery.publication.stable';
    default:
      return 'health.battery.publication.unknown';
  }
}

export function voltageContextI18nKey(context: BatteryVoltageContext): string {
  return `health.battery.voltageContext.${context}`;
}

export function formatMethodLabel(method: string | null | undefined): string {
  if (!method) return '—';
  return method.replace(/_/g, ' ');
}

export function formatConfidenceLabel(confidence: string | null | undefined): string {
  if (!confidence) return '—';
  return confidence.replace(/_/g, ' ');
}

export function formatKwh(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)} kWh`;
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

export function formatVolts(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)} V`;
}

export function maskInternalId(id: string | null | undefined): string | null {
  if (!id) return null;
  if (id.length <= 8) return id;
  return `…${id.slice(-6)}`;
}
