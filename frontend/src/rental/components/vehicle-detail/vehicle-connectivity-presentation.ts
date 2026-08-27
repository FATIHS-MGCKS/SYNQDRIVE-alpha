import type { StatusTone } from '../../../components/patterns/status-utils';
import type {
  DeviceConnectionSummary,
  FleetTelemetryFreshness,
  VehicleConnectivityRuntimeState,
} from '../../../lib/api';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  attentionTone,
  formatInterruptionDuration,
  formatLastTelemetry,
  physicalDeviceLabel,
  physicalDevicePresentationTone,
  providerLinkLabel,
  providerLinkPresentationTone,
  recommendedActionLabel,
  telemetryFreshnessLabel,
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
  return telemetryFreshnessLabel(state, t);
}

export { providerLinkPresentationTone, physicalDevicePresentationTone, formatInterruptionDuration };

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
    ? t('fleetConnectivity.detail.activeInterruption', {
        since,
        duration: formatInterruptionDuration(summary.openUnpluggedDurationMs, locale),
      })
    : t('fleetConnectivity.detail.noActiveInterruption');

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
