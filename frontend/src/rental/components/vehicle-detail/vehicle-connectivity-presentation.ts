import type { StatusTone } from '../../../components/patterns/status-utils';
import type {
  DeviceConnectionSummary,
  FleetTelemetryFreshness,
  PhysicalDeviceState,
  ProviderLinkState,
  VehicleConnectivityRuntimeState,
} from '../../../lib/api';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  attentionTone,
  formatLastTelemetry,
  physicalDeviceLabel,
  providerLinkLabel,
  recommendedActionLabel,
  telemetryFreshnessTone,
  type FleetConnectivityTranslator,
} from '../fleet-connectivity/fleet-connectivity.presentation';

export type VehicleConnectivityTranslator = FleetConnectivityTranslator;

export type VehicleConnectivityOverviewView = {
  primaryTelemetryLabel: string;
  primaryTelemetryTone: StatusTone;
  lastSignalText: string;
  dataSourceText: string;
  dataSourceTone: StatusTone;
  deviceText: string;
  deviceTone: StatusTone;
  interruptionText: string;
  interruptionTone: StatusTone;
  attentionText: string | null;
  attentionTone: StatusTone | null;
  recommendedActionText: string | null;
  showRentalRelevantAlert: boolean;
};

export function telemetryStateLabel(
  state: FleetTelemetryFreshness,
  t: VehicleConnectivityTranslator,
): string {
  const key = `fleetConnectivity.telemetryFreshness.${state}` as TranslationKey;
  return t(key);
}

/** Provider ACTIVE must not read as vehicle-online — keep neutral. */
export function providerLinkPresentationTone(state: ProviderLinkState): StatusTone {
  switch (state) {
    case 'ACTIVE':
      return 'neutral';
    case 'REAUTH_REQUIRED':
      return 'warning';
    case 'REVOKED':
    case 'ERROR':
      return 'critical';
    case 'NO_LINK':
      return 'noData';
    default:
      return 'noData';
  }
}

export function physicalDevicePresentationTone(state: PhysicalDeviceState): StatusTone {
  switch (state) {
    case 'UNPLUGGED_CONFIRMED':
      return 'critical';
    case 'PLUGGED_CONFIRMED':
    case 'PLUGGED_INFERRED':
      return 'neutral';
    case 'NOT_APPLICABLE':
      return 'neutral';
    default:
      return 'noData';
  }
}

export function formatInterruptionDuration(
  ms: number | null | undefined,
  locale: string,
): string {
  if (ms == null || ms < 0) return '—';
  const minutes = Math.floor(ms / 60_000);
  const de = locale === 'de';
  if (minutes < 60) {
    return de ? `${minutes} Min.` : `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (hours < 24) {
    return de
      ? rem > 0
        ? `${hours} Std. ${rem} Min.`
        : `${hours} Std.`
      : rem > 0
        ? `${hours} h ${rem} min`
        : `${hours} h`;
  }
  const days = Math.floor(hours / 24);
  const hr = hours % 24;
  return de
    ? hr > 0
      ? `${days} T. ${hr} Std.`
      : `${days} T.`
    : hr > 0
      ? `${days} d ${hr} h`
      : `${days} d`;
}

export function shouldShowVehicleConnectivityCard(
  summary: DeviceConnectionSummary | null | undefined,
): boolean {
  if (!summary?.connectivityRuntime) return false;
  return true;
}

export function buildVehicleConnectivityOverviewView(
  summary: DeviceConnectionSummary,
  runtime: VehicleConnectivityRuntimeState,
  t: VehicleConnectivityTranslator,
  locale: string,
  now = Date.now(),
): VehicleConnectivityOverviewView {
  const primaryTelemetryLabel = telemetryStateLabel(runtime.telemetryState, t);
  const primaryTelemetryTone = telemetryFreshnessTone(runtime.telemetryState);

  const lastSignalText = formatLastTelemetry(runtime.lastTelemetryAt, t, locale, now);

  const providerName = summary.dimoLinked
    ? t('vehicleDetail.connectivity.providerDimo')
    : t('vehicleDetail.connectivity.providerGeneric');
  const dataSourceText = `${providerName} · ${providerLinkLabel(runtime.providerLinkState, t)}`;

  const deviceText = physicalDeviceLabel(runtime.physicalDeviceState, t);

  const since = summary.openUnpluggedSince
    ? new Date(summary.openUnpluggedSince).toLocaleString(
        locale === 'de' ? 'de-DE' : 'en-GB',
        { dateStyle: 'short', timeStyle: 'short' },
      )
    : '—';

  const interruptionText = summary.openUnpluggedEpisode
    ? t('vehicleDetail.connectivity.activeInterruption', {
        since,
        duration: formatInterruptionDuration(summary.openUnpluggedDurationMs, locale),
      })
    : t('vehicleDetail.connectivity.noActiveInterruption');

  const showAttention =
    runtime.attentionState !== 'NONE' || runtime.requiresAction;
  const attentionText = showAttention
    ? t(`fleetConnectivity.attention.${runtime.attentionState}` as TranslationKey)
    : null;

  const recommendedActionText =
    runtime.requiresAction && runtime.recommendedAction !== 'NONE'
      ? recommendedActionLabel(runtime.recommendedAction, t)
      : null;

  return {
    primaryTelemetryLabel,
    primaryTelemetryTone,
    lastSignalText,
    dataSourceText,
    dataSourceTone: providerLinkPresentationTone(runtime.providerLinkState),
    deviceText,
    deviceTone: physicalDevicePresentationTone(runtime.physicalDeviceState),
    interruptionText,
    interruptionTone: summary.openUnpluggedEpisode ? 'critical' : 'neutral',
    attentionText,
    attentionTone: showAttention ? attentionTone(runtime.attentionState) : null,
    recommendedActionText,
    showRentalRelevantAlert: Boolean(summary.rentalRelevant && summary.openUnpluggedEpisode),
  };
}
