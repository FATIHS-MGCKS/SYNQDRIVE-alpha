import type { TranslationKey } from '../i18n/translations/en';
import type { TelemetryFreshness } from './telemetryFreshness';
import type { VehicleTelemetryDisplayState } from './vehicle-telemetry-runtime';
import type { VehicleCleaningUiStatus } from './vehicle-cleaning-status-mutation';
import type { VehicleOperationalUiStatus } from './vehicle-detail-header-status';
import type { OverviewMapPositionMode } from './overview-map-position';
import type {
  OverviewMapHintKey,
  OverviewMapHintSubKey,
} from './overview-map-position';
import type { VehicleOverviewCardStatus } from './vehicle-overview.types';
import type { DeviceConnectionStatus } from '../../lib/api';

export type VehicleDetailTranslate = (
  key: TranslationKey,
  vars?: Record<string, string | number>,
) => string;

/** Keys introduced for vehicle detail — validated by static i18n test. */
export const VEHICLE_DETAIL_I18N_KEYS = [
  'vehicle.requirements',
  'vehicleDetail.tab.health',
  'vehicleDetail.header.lastSignal',
  'vehicleDetail.header.obdUnplugged',
  'vehicleDetail.header.signalTitle',
  'vehicleDetail.header.vehicleFallback',
  'vehicleDetail.telemetry.live',
  'vehicleDetail.telemetry.standby',
  'vehicleDetail.telemetry.softOffline',
  'vehicleDetail.telemetry.offline',
  'vehicleDetail.telemetry.noSignal',
  'vehicleDetail.telemetry.delayed',
  'vehicleDetail.telemetry.age.justNow',
  'vehicleDetail.telemetry.age.minutesAgo',
  'vehicleDetail.telemetry.age.hoursAgo',
  'vehicleDetail.telemetry.age.daysAgo',
  'vehicleDetail.map.badge.lastKnown',
  'vehicleDetail.map.badge.signalIssue',
  'vehicleDetail.map.badge.noTracking',
  'vehicleDetail.map.badge.acquiring',
  'vehicleDetail.map.hint.telemetryUnavailable',
  'vehicleDetail.map.hint.lastKnownShown',
  'vehicleDetail.map.hint.noCoordinates',
  'vehicleDetail.map.hint.noLiveTracking',
  'vehicleDetail.map.hud.state',
  'vehicleDetail.map.hud.energy',
  'vehicleDetail.map.hud.fuel',
  'vehicleDetail.map.hud.odometer',
  'vehicleDetail.map.hud.km',
  'vehicleDetail.health.loading',
  'vehicleDetail.health.loadingTitle',
  'vehicleDetail.health.critical',
  'vehicleDetail.health.warning',
  'vehicleDetail.health.good',
  'vehicleDetail.health.noData',
  'vehicleDetail.health.insufficientData',
  'vehicleDetail.health.dataCoverageTitle',
  'vehicleDetail.health.limitedData',
  'vehicleDetail.overview.liveStatusAria',
  'vehicleDetail.overview.allSynced',
  'vehicleDetail.overview.areasSynced',
  'vehicleDetail.overview.oneAreaSynced',
  'vehicleDetail.overview.statePrefix',
  'vehicleDetail.overview.quickCardAria',
  'vehicleDetail.overview.dataUnavailable',
  'vehicleDetail.cardStatus.clear',
  'vehicleDetail.cardStatus.watch',
  'vehicleDetail.cardStatus.critical',
  'vehicleDetail.cardStatus.live',
  'vehicleDetail.cardStatus.idle',
  'vehicleDetail.readiness.ready',
  'vehicleDetail.readiness.attention',
  'vehicleDetail.readiness.blocked',
  'vehicleDetail.readiness.unknown',
  'vehicleDetail.readiness.statusUnknown',
  'vehicleDetail.displayState.moving',
  'vehicleDetail.displayState.idle',
  'vehicleDetail.displayState.parked',
  'vehicleDetail.deviceConnection.title',
  'vehicleDetail.deviceConnection.aria',
  'vehicleDetail.deviceConnection.webhookStatus',
  'vehicleDetail.deviceConnection.openInterruption',
  'vehicleDetail.deviceConnection.cardLoading',
  'vehicleDetail.deviceConnection.cardForbidden',
  'vehicleDetail.deviceConnection.cardError',
  'vehicleDetail.deviceConnection.cardEmpty',
  'vehicleDetail.deviceConnection.cardStaleHint',
  'vehicleDetail.deviceConnection.retry',
  'vehicleDetail.deviceConnection.lteConnected',
  'vehicleDetail.deviceConnection.deviceUnplugged',
  'vehicleDetail.deviceConnection.devicePluggedIn',
  'vehicleDetail.deviceConnection.telematicsInterruption',
  'vehicleDetail.deviceConnection.duringActiveBooking',
  'vehicleDetail.deviceConnection.reconnected',
  'vehicleDetail.deviceConnection.noOpenInterruption',
  'vehicleDetail.deviceConnection.unknown',
  'vehicleDetail.deviceConnection.webhookActive',
  'vehicleDetail.deviceConnection.webhookNotConfigured',
  'vehicleDetail.deviceConnection.webhookUnknown',
  'vehicleDetail.deviceConnection.duration.minutes',
  'vehicleDetail.deviceConnection.duration.hours',
  'vehicleDetail.deviceConnection.duration.hoursMinutes',
  'vehicleDetail.deviceConnection.duration.days',
  'vehicleDetail.deviceConnection.duration.daysHours',
] as const satisfies readonly TranslationKey[];

export type VehicleDetailI18nKey = (typeof VEHICLE_DETAIL_I18N_KEYS)[number];

const TAB_KEY_BY_VIEW: Record<string, TranslationKey> = {
  overview: 'vehicle.overview',
  trips: 'vehicle.trips',
  'health-errors': 'vehicleDetail.tab.health',
  damages: 'vehicle.damages',
  documents: 'vehicle.documents',
  'vehicle-bookings': 'vehicle.bookings',
  'vehicle-tasks': 'vehicle.taskList',
  'vehicle-requirements': 'vehicle.requirements',
};

export function translateVehicleDetailTab(
  tabKey: string,
  t: VehicleDetailTranslate,
): string {
  const key = TAB_KEY_BY_VIEW[tabKey];
  return key ? t(key) : tabKey;
}

export function translateCleaningStatus(
  status: VehicleCleaningUiStatus,
  t: VehicleDetailTranslate,
): string {
  return status === 'Clean' ? t('status.clean') : t('status.needsCleaning');
}

export function translateOperationalEditStatus(
  status: VehicleOperationalUiStatus,
  t: VehicleDetailTranslate,
): string {
  switch (status) {
    case 'Available':
      return t('status.available');
    case 'Active Rented':
      return t('status.rented');
    case 'Reserved':
      return t('status.reserved');
    case 'Maintenance':
      return t('status.maintenance');
    case 'Manual Block':
      return t('status.manualBlock');
    default:
      return status;
  }
}

export function translateTelemetryFreshnessShort(
  freshness: TelemetryFreshness,
  t: VehicleDetailTranslate,
): string {
  switch (freshness) {
    case 'live':
      return t('vehicleDetail.telemetry.live');
    case 'standby':
      return t('vehicleDetail.telemetry.standby');
    case 'signal_delayed':
      return t('vehicleDetail.telemetry.softOffline');
    case 'offline':
      return t('vehicleDetail.telemetry.offline');
    case 'no_signal':
    default:
      return t('vehicleDetail.telemetry.noSignal');
  }
}

export function translateTelemetryDisplayState(
  state: VehicleTelemetryDisplayState,
  t: VehicleDetailTranslate,
): string {
  switch (state) {
    case 'live':
      return t('vehicleDetail.telemetry.live');
    case 'standby':
      return t('vehicleDetail.telemetry.standby');
    case 'soft_offline':
      return t('vehicleDetail.telemetry.softOffline');
    case 'offline':
      return t('vehicleDetail.telemetry.offline');
    case 'unknown':
    default:
      return t('vehicleDetail.telemetry.noSignal');
  }
}

export function translateTelemetryAgeShort(
  signalAgeMs: number | null | undefined,
  isLive: boolean,
  t: VehicleDetailTranslate,
): string {
  if (signalAgeMs == null) return '—';
  const mins = Math.floor(signalAgeMs / 60_000);
  if (mins < 2) {
    return isLive ? t('vehicleDetail.telemetry.age.justNow') : '—';
  }
  if (mins < 60) return t('vehicleDetail.telemetry.age.minutesAgo', { minutes: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('vehicleDetail.telemetry.age.hoursAgo', { hours: hrs });
  const days = Math.floor(hrs / 24);
  return t('vehicleDetail.telemetry.age.daysAgo', { days });
}

export function translateMapPositionBadge(
  mode: OverviewMapPositionMode,
  isLiveTracking: boolean,
  t: VehicleDetailTranslate,
): { label: string; tone: 'live' | 'watch' | 'muted' } | null {
  switch (mode) {
    case 'livePosition':
      return { label: t('fleetConnectivity.lastData.live'), tone: 'live' };
    case 'lastKnownPosition':
    case 'staticPositionOnly':
      return { label: t('vehicleDetail.map.badge.lastKnown'), tone: 'watch' };
    case 'telemetryUnavailable':
      return { label: t('vehicleDetail.map.badge.signalIssue'), tone: 'muted' };
    case 'trackingUnavailable':
      return { label: t('vehicleDetail.map.badge.noTracking'), tone: 'muted' };
    case 'noPosition':
      return isLiveTracking
        ? { label: t('vehicleDetail.map.badge.acquiring'), tone: 'watch' }
        : null;
    default:
      return null;
  }
}

export function translateMapOperatorHint(
  key: OverviewMapHintKey | null | undefined,
  t: VehicleDetailTranslate,
): string | null {
  if (!key) return null;
  switch (key) {
    case 'telemetryUnavailable':
      return t('vehicleDetail.map.hint.telemetryUnavailable');
    case 'noCoordinates':
      return t('vehicleDetail.map.hint.noCoordinates');
    case 'noLiveTracking':
      return t('vehicleDetail.map.hint.noLiveTracking');
    default:
      return null;
  }
}

export function translateMapOperatorHintSub(
  key: OverviewMapHintSubKey | null | undefined,
  t: VehicleDetailTranslate,
): string | null {
  if (!key) return null;
  switch (key) {
    case 'lastKnownShown':
      return t('vehicleDetail.map.hint.lastKnownShown');
    case 'noCoordinates':
      return t('vehicleDetail.map.hint.noCoordinates');
    default:
      return null;
  }
}

export function translateOverviewCardStatus(
  status: VehicleOverviewCardStatus,
  t: VehicleDetailTranslate,
): string {
  switch (status) {
    case 'clear':
      return t('vehicleDetail.cardStatus.clear');
    case 'attention':
      return t('vehicleDetail.cardStatus.watch');
    case 'critical':
      return t('vehicleDetail.cardStatus.critical');
    case 'active':
      return t('vehicleDetail.cardStatus.live');
    case 'neutral':
    default:
      return t('vehicleDetail.cardStatus.idle');
  }
}

export function translateVehicleDisplayStateLabel(
  displayState: string,
  t: VehicleDetailTranslate,
): string {
  switch (displayState) {
    case 'MOVING':
      return t('vehicleDetail.displayState.moving');
    case 'IDLE':
      return t('vehicleDetail.displayState.idle');
    case 'PARKED':
      return t('vehicleDetail.displayState.parked');
    default:
      return displayState;
  }
}

export function translateDeviceConnectionStatus(
  status: DeviceConnectionStatus,
  t: VehicleDetailTranslate,
): string {
  if (status === 'plugged') return t('vehicleDetail.deviceConnection.reconnected');
  if (status === 'unplugged') return t('vehicleDetail.deviceConnection.deviceUnplugged');
  return t('vehicleDetail.deviceConnection.unknown');
}

export function translateDeviceConnectionEventType(
  eventType: string,
  t: VehicleDetailTranslate,
): string {
  if (eventType === 'OBD_DEVICE_UNPLUGGED') {
    return t('vehicleDetail.deviceConnection.deviceUnplugged');
  }
  if (eventType === 'OBD_DEVICE_PLUGGED_IN') {
    return t('vehicleDetail.deviceConnection.devicePluggedIn');
  }
  return eventType;
}

export function translateWebhookStatusLabel(
  status: 'active' | 'not_configured' | string,
  t: VehicleDetailTranslate,
): string {
  if (status === 'active') return t('vehicleDetail.deviceConnection.webhookActive');
  if (status === 'not_configured') return t('vehicleDetail.deviceConnection.webhookNotConfigured');
  return t('vehicleDetail.deviceConnection.webhookUnknown');
}

export function formatDeviceConnectionDuration(
  ms: number | null | undefined,
  t: VehicleDetailTranslate,
): string {
  if (ms == null || ms < 0) return '—';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) {
    return t('vehicleDetail.deviceConnection.duration.minutes', { minutes });
  }
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (hours < 24) {
    return rem > 0
      ? t('vehicleDetail.deviceConnection.duration.hoursMinutes', { hours, minutes: rem })
      : t('vehicleDetail.deviceConnection.duration.hours', { hours });
  }
  const days = Math.floor(hours / 24);
  const hr = hours % 24;
  return hr > 0
    ? t('vehicleDetail.deviceConnection.duration.daysHours', { days, hours: hr })
    : t('vehicleDetail.deviceConnection.duration.days', { days });
}
