/**
 * P1.4 — Vehicle Detail operational/connectivity presentation from P1.1 → P1.2.
 *
 * Vehicle Detail must not derive operational connectivity from legacy onlineStatus,
 * timestamp thresholds, or poll-store freshness helpers.
 */
import type { StatusTone } from '../../components/patterns';
import type { OverallConnectivityState } from '../../lib/api';
import {
  formatLastTelemetry,
  overallStateLabel,
  overallStateTone,
} from '../components/fleet-connectivity/fleet-connectivity.presentation';
import { de } from '../i18n/translations/de';
import { en } from '../i18n/translations/en';
import type { TranslationKey } from '../i18n/translations/en';
import {
  buildFleetVehicleUiProjection,
  type FleetProjectionVehicle,
} from './fleet-vehicle-ui-projection';
import type { VehicleOperationalUiProjection } from './operational-projection';
import {
  resolveHealthDisplayFromUi,
  resolveTelemetryFromUi,
} from './fleet-p1-3-display';
import { resolveFleetVehicleDisplayState } from './fleetVehicleDisplay';
import type { OverviewMapPositionMode } from './overview-map-position';

const OVERALL_CONNECTIVITY_LABEL_STATES: ReadonlySet<OverallConnectivityState> = new Set([
  'AUTHORIZATION_REQUIRED',
  'DEVICE_UNPLUGGED',
  'NO_ACTIVE_DATA_SOURCE',
  'INTEGRATION_ERROR',
  'OFFLINE',
  'UNKNOWN',
]);

function tFor(locale: 'en' | 'de'): (key: TranslationKey, params?: Record<string, string | number>) => string {
  const dict = locale === 'de' ? de : en;
  return (key, params) => {
    let value = dict[key] ?? key;
    if (params) {
      for (const [name, replacement] of Object.entries(params)) {
        value = value.replace(`{${name}}`, String(replacement));
      }
    }
    return value;
  };
}

export interface VehicleDetailConnectivityPresentation {
  label: string;
  shortLabel: string;
  tone: StatusTone;
  lastDataLabel: string;
  title: string;
  dotColorClass: string;
  labelColorClass: string;
  isLivePulse: boolean;
}

function toneToDotClass(tone: StatusTone): string {
  switch (tone) {
    case 'success':
      return 'text-[color:var(--status-positive)] fill-[color:var(--status-positive)] animate-online-pulse';
    case 'watch':
    case 'warning':
      return 'text-[color:var(--status-watch)] fill-[color:var(--status-watch)]';
    case 'critical':
      return 'text-[color:var(--status-critical)] fill-[color:var(--status-critical)]';
    case 'noData':
    case 'neutral':
    default:
      return 'text-muted-foreground fill-[color:var(--status-nodata)]';
  }
}

function toneToLabelClass(tone: StatusTone): string {
  switch (tone) {
    case 'success':
      return 'text-[color:var(--status-positive)]';
    case 'watch':
    case 'warning':
      return 'text-[color:var(--status-watch)]';
    case 'critical':
      return 'text-[color:var(--status-critical)]';
    case 'noData':
    case 'neutral':
    default:
      return 'text-muted-foreground';
  }
}

export function resolveVehicleDetailConnectivityFromUi(
  ui: VehicleOperationalUiProjection,
  vehicle: FleetProjectionVehicle,
  options: { locale?: 'en' | 'de'; now?: number } = {},
): VehicleDetailConnectivityPresentation {
  const locale = options.locale ?? 'de';
  const t = tFor(locale);
  const now = options.now ?? Date.now();
  const telemetry = resolveTelemetryFromUi(ui);
  const overall = ui.connectivity.overallState.presentation;
  const telemetryPresentation = ui.connectivity.telemetryState.presentation;

  let label = telemetry.telemetryLabel;
  let tone: StatusTone = telemetryPresentation?.tone ?? 'noData';

  if (overall && OVERALL_CONNECTIVITY_LABEL_STATES.has(overall.state)) {
    label = overall.label;
    tone = overallStateTone(overall.state);
  } else if (overall?.state === 'SOFT_OFFLINE' && telemetryPresentation) {
    label = telemetryPresentation.label;
    tone = telemetryPresentation.tone;
  } else if (overall?.state === 'STANDBY' && telemetryPresentation) {
    label = telemetryPresentation.label;
    tone = telemetryPresentation.tone;
  } else if (overall?.state === 'TELEMETRY_ACTIVE' && telemetryPresentation) {
    label = telemetryPresentation.label;
    tone = telemetryPresentation.tone;
  } else if (!telemetryPresentation && overall) {
    label = overall.label;
    tone = overallStateTone(overall.state);
  } else if (!telemetryPresentation) {
    label = '—';
    tone = 'noData';
  }

  const lastTelemetryAt = vehicle.connectivityRuntime?.lastTelemetryAt ?? null;
  const lastDataLabel = formatLastTelemetry(lastTelemetryAt, t, locale, now);
  const lastTelemetryCaption = t('fleetConnectivity.detail.lastTelemetry');

  const primaryReason =
    ui.operator.primaryReason.presentation?.label ??
    ui.attention.primaryReason.presentation?.label ??
    null;
  const titleParts = [label, `${lastTelemetryCaption} ${lastDataLabel}`];
  if (primaryReason) titleParts.push(primaryReason);

  return {
    label,
    shortLabel: label,
    tone,
    lastDataLabel,
    title: titleParts.join(' · '),
    dotColorClass: toneToDotClass(tone),
    labelColorClass: toneToLabelClass(tone),
    isLivePulse: tone === 'success' && telemetry.telemetryStatus === 'live',
  };
}

export function resolveVehicleDetailConnectivityPresentation(
  vehicle: FleetProjectionVehicle,
  options: { locale?: 'en' | 'de'; now?: number } = {},
): VehicleDetailConnectivityPresentation {
  const ui = buildFleetVehicleUiProjection(vehicle, { locale: options.locale ?? 'de' });
  return resolveVehicleDetailConnectivityFromUi(ui, vehicle, options);
}

export function resolveVehicleDetailFleetDisplay(
  vehicle: FleetProjectionVehicle,
  options: {
    locale?: 'en' | 'de';
    rentalHealth?: import('../../lib/api').VehicleHealthResponse | null;
    now?: number;
  } = {},
) {
  const locale = options.locale ?? 'de';
  const ui = buildFleetVehicleUiProjection(vehicle, { locale });
  return {
    ui,
    display: resolveFleetVehicleDisplayState(vehicle, {
      rentalHealth: options.rentalHealth ?? null,
      locale,
      compact: false,
      uiProjection: ui,
      t: tFor(locale),
      now: options.now,
    }),
    connectivity: resolveVehicleDetailConnectivityFromUi(ui, vehicle, { locale, now: options.now }),
    health: resolveHealthDisplayFromUi(ui),
  };
}

export type VehicleDetailMapTrackingTone = 'live' | 'watch' | 'muted';

/**
 * Map HUD position badge — position provenance only.
 *
 * Connectivity health is shown separately in VehicleConnectionBadge (P1.2).
 * OverviewMapPositionMode answers what coordinate is rendered, not provider health.
 */
export function resolveVehicleDetailMapTrackingBadge(
  positionMode: OverviewMapPositionMode,
  options: { locale?: 'en' | 'de'; isLiveTracking?: boolean } = {},
): { label: string; tone: VehicleDetailMapTrackingTone } | null {
  const locale = options.locale ?? 'de';
  const t = tFor(locale);

  switch (positionMode) {
    case 'livePosition':
      return {
        label: t('fleetConnectivity.telemetryFreshness.live'),
        tone: 'live',
      };
    case 'lastKnownPosition':
    case 'staticPositionOnly':
      return {
        label: t('vehicleDetail.mapBadge.lastKnown'),
        tone: 'watch',
      };
    case 'telemetryUnavailable':
      return {
        label: t('vehicleDetail.mapBadge.signalIssue'),
        tone: 'muted',
      };
    case 'trackingUnavailable':
      return {
        label: t('vehicleDetail.mapBadge.noTracking'),
        tone: 'muted',
      };
    case 'noPosition':
      if (options.isLiveTracking) {
        return {
          label: t('vehicleDetail.mapBadge.acquiring'),
          tone: 'watch',
        };
      }
      return null;
    default:
      return null;
  }
}
