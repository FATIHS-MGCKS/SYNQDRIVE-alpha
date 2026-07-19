import type { StatusTone } from '../../../components/patterns/status-utils';
import type {
  ConnectivityAttentionState,
  ConnectivityReasonCode,
  ConnectivityRecommendedAction,
  FleetConnectivityListItem,
  FleetConnectivityTimelineEventType,
  FleetDataCoverageState,
  FleetTelemetryFreshness,
  OverallConnectivityState,
  PhysicalDeviceState,
  ProviderLinkState,
} from '../../../lib/api';
import type { TranslationKey } from '../../i18n/translations/en';

export type FleetConnectivityTranslator = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

export function overallStateLabel(
  state: OverallConnectivityState,
  t: FleetConnectivityTranslator,
): string {
  const key = `fleetConnectivity.state.${state}` as TranslationKey;
  return t(key);
}

export function overallStateTone(state: OverallConnectivityState): StatusTone {
  switch (state) {
    case 'TELEMETRY_ACTIVE':
      return 'success';
    case 'STANDBY':
      return 'neutral';
    case 'SOFT_OFFLINE':
      return 'watch';
    case 'DEVICE_UNPLUGGED':
    case 'OFFLINE':
    case 'INTEGRATION_ERROR':
      return 'critical';
    case 'AUTHORIZATION_REQUIRED':
      return 'warning';
    case 'NO_ACTIVE_DATA_SOURCE':
      return 'noData';
    default:
      return 'noData';
  }
}

export function attentionTone(attention: ConnectivityAttentionState): StatusTone {
  switch (attention) {
    case 'CRITICAL':
      return 'critical';
    case 'ACTION_REQUIRED':
      return 'warning';
    case 'WATCH':
      return 'watch';
    default:
      return 'neutral';
  }
}

export function reasonCodeHint(
  code: ConnectivityReasonCode | null,
  t: FleetConnectivityTranslator,
): string {
  if (!code) return t('fleetConnectivity.hint.none');
  const key = `fleetConnectivity.reason.${code}` as TranslationKey;
  return t(key);
}

export function recommendedActionLabel(
  action: ConnectivityRecommendedAction,
  t: FleetConnectivityTranslator,
): string {
  const key = `fleetConnectivity.action.${action}` as TranslationKey;
  return t(key);
}

export function formatLastTelemetry(
  iso: string | null,
  t: FleetConnectivityTranslator,
  locale: string,
  now = Date.now(),
): string {
  if (!iso) return t('fleetConnectivity.lastData.never');
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return t('fleetConnectivity.lastData.unknown');

  const diffMs = Math.max(0, now - ts);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 5) return t('fleetConnectivity.lastData.live');

  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 48) {
    return t('fleetConnectivity.lastData.hoursAgo', { count: Math.max(1, hours) });
  }

  return new Date(iso).toLocaleString(locale === 'de' ? 'de-DE' : 'en-GB', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export function coverageStateLabel(
  state: FleetDataCoverageState,
  t: FleetConnectivityTranslator,
): string {
  const key = `fleetConnectivity.coverage.${state}` as TranslationKey;
  return t(key);
}

export function coverageStateTone(state: FleetDataCoverageState): StatusTone {
  switch (state) {
    case 'GOOD':
      return 'success';
    case 'PARTIAL':
      return 'watch';
    case 'INSUFFICIENT':
      return 'warning';
    case 'NOT_APPLICABLE':
      return 'neutral';
    default:
      return 'noData';
  }
}

export function providerLinkLabel(
  state: ProviderLinkState,
  t: FleetConnectivityTranslator,
): string {
  const key = `fleetConnectivity.providerLink.${state}` as TranslationKey;
  return t(key);
}

export function physicalDeviceLabel(
  state: PhysicalDeviceState,
  t: FleetConnectivityTranslator,
): string {
  const key = `fleetConnectivity.physicalDevice.${state}` as TranslationKey;
  return t(key);
}

export function timelineEventLabel(
  type: FleetConnectivityTimelineEventType,
  t: FleetConnectivityTranslator,
): string {
  const key = `fleetConnectivity.timeline.${type}` as TranslationKey;
  return t(key);
}

export function capabilitySignalLabel(key: string, t: FleetConnectivityTranslator): string {
  const normalized = key as 'gps' | 'odometer' | 'speed' | 'fuel' | 'evSoc' | 'dtc';
  const mapKey = `fleetConnectivity.capability.${normalized}` as TranslationKey;
  return t(mapKey);
}

export function capabilityAvailabilityLabel(
  availability: 'available' | 'missing' | 'unknown' | 'not_applicable',
  t: FleetConnectivityTranslator,
): string {
  const key = `fleetConnectivity.capabilityAvailability.${availability}` as TranslationKey;
  return t(key);
}

export function capabilityFreshnessLabel(
  freshness: 'fresh' | 'stale' | 'unknown',
  t: FleetConnectivityTranslator,
): string {
  const key = `fleetConnectivity.capabilityFreshness.${freshness}` as TranslationKey;
  return t(key);
}

export function providerSummaryLabel(
  providerLabel: string,
  t: FleetConnectivityTranslator,
): string {
  if (providerLabel === 'telematics') {
    return t('fleetConnectivity.provider.telematics');
  }
  return providerLabel;
}

export function deviceKindLabel(kind: string, t: FleetConnectivityTranslator): string {
  const key = `fleetConnectivity.deviceKind.${kind}` as TranslationKey;
  return t(key);
}

export function primaryListHint(
  item: FleetConnectivityListItem,
  t: FleetConnectivityTranslator,
): string {
  if (item.primaryReasonCode) {
    return reasonCodeHint(item.primaryReasonCode, t);
  }
  if (item.overallState === 'STANDBY') {
    return t('fleetConnectivity.hint.standbyParked');
  }
  if (item.overallState === 'TELEMETRY_ACTIVE') {
    return t('fleetConnectivity.hint.telemetryActive');
  }
  return t('fleetConnectivity.hint.none');
}

export function vehicleTitle(ref: FleetConnectivityListItem['vehicle']): string {
  const title = [ref.make, ref.model, ref.year].filter(Boolean).join(' ');
  return title || '—';
}

export function showLiveDot(state: OverallConnectivityState): boolean {
  return state === 'TELEMETRY_ACTIVE';
}

export function telemetryFreshnessTone(state: FleetTelemetryFreshness): StatusTone {
  if (state === 'live') return 'success';
  if (state === 'standby' || state === 'signal_delayed') return 'watch';
  if (state === 'offline') return 'critical';
  return 'noData';
}
