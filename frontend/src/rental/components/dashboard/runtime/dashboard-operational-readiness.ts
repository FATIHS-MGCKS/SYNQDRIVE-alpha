/**
 * P1.5 — Dashboard readiness selectors over P1.1 → P1.2 canonical projection.
 *
 * Dashboard must not derive operational readiness from timestamps, onlineStatus,
 * or legacy telemetry freshness heuristics.
 */
import type { VehicleConnectivityRuntimeState, VehicleHealthResponse } from '../../../../lib/api';
import type { VehicleData } from '../../../data/vehicles';
import { buildFleetVehicleUiProjection, type FleetProjectionVehicle } from '../../../lib/fleet-vehicle-ui-projection';
import {
  OPERATIONAL_AVAILABILITY_STATE,
  isOperationalAvailabilityState,
  type OperationalAvailabilityState,
} from '../../../lib/operational-availability/types';
import type { VehicleOperationalUiProjection } from '../../../lib/operational-projection';
import { de } from '../../../i18n/translations/de';
import { en } from '../../../i18n/translations/en';
import type { TranslationKey } from '../../../i18n/translations/en';
import { createRuntimeReason } from './dashboardRuntimeReasons';
import type { RuntimeReason, TelemetryConnectionState } from './dashboardRuntimeTypes';

export type DashboardOperationalAvailability = OperationalAvailabilityState | 'absent';

function tFor(locale: 'en' | 'de'): (key: TranslationKey) => string {
  const dict = locale === 'de' ? de : en;
  return (key: TranslationKey) => dict[key] ?? key;
}

export function readDashboardOperationalAvailability(
  vehicle: VehicleData,
): DashboardOperationalAvailability {
  const state = vehicle.operationalAvailability?.state;
  return isOperationalAvailabilityState(state) ? state : 'absent';
}

export function isDashboardOperationalAvailabilityReady(vehicle: VehicleData): boolean {
  return readDashboardOperationalAvailability(vehicle) === OPERATIONAL_AVAILABILITY_STATE.AVAILABLE;
}

export function buildDashboardVehicleUiProjection(
  vehicle: VehicleData,
  locale: 'en' | 'de' = 'de',
): VehicleOperationalUiProjection {
  return buildFleetVehicleUiProjection(vehicle as FleetProjectionVehicle, { locale });
}

export function mapCanonicalTelemetryState(
  telemetry: VehicleConnectivityRuntimeState['telemetryState'] | undefined,
): TelemetryConnectionState {
  switch (telemetry) {
    case 'live':
      return 'live';
    case 'standby':
      return 'standby';
    case 'signal_delayed':
      return 'soft_offline';
    case 'offline':
      return 'offline';
    case 'no_signal':
      return 'unknown';
    default:
      return 'unknown';
  }
}

/** Canonical telemetry for dashboard runtime — connectivityRuntime only. */
export function deriveDashboardTelemetryState(vehicle: VehicleData): TelemetryConnectionState {
  return mapCanonicalTelemetryState(vehicle.connectivityRuntime?.telemetryState);
}

/** Canonical dashboard critical attention — attentionState is authoritative; overallState alone never escalates. */
export function isCanonicalDashboardCriticalAttention(
  runtime: VehicleConnectivityRuntimeState | undefined,
  _ui?: VehicleOperationalUiProjection,
): boolean {
  if (!runtime) return false;
  return runtime.attentionState === 'CRITICAL' || runtime.attentionState === 'ACTION_REQUIRED';
}

export function isCanonicalDashboardWatchAttention(
  runtime: VehicleConnectivityRuntimeState | undefined,
): boolean {
  return runtime?.attentionState === 'WATCH';
}

export function addCanonicalOperationalAvailabilityReasons(input: {
  target: RuntimeReason[];
  vehicle: VehicleData;
  locale: string;
}): void {
  const availability = readDashboardOperationalAvailability(input.vehicle);
  const de = input.locale === 'de';
  const t = tFor(de ? 'de' : 'en');

  if (availability === OPERATIONAL_AVAILABILITY_STATE.NEEDS_VERIFICATION) {
    input.target.push(
      createRuntimeReason({
        category: 'operational',
        severity: 'warning',
        title: t('fleet.operationalAvailability.needsVerification'),
        source: 'canonical:operational-availability:needs-verification',
        blocking: false,
        preventsReady: true,
      }),
    );
    return;
  }

  if (availability === OPERATIONAL_AVAILABILITY_STATE.UNAVAILABLE) {
    input.target.push(
      createRuntimeReason({
        category: 'operational',
        severity: 'critical',
        title: t('fleet.operationalAvailability.unavailable'),
        source: 'canonical:operational-availability:unavailable',
        blocking: true,
        preventsReady: true,
      }),
    );
    return;
  }

  if (availability === OPERATIONAL_AVAILABILITY_STATE.UNKNOWN || availability === 'absent') {
    input.target.push(
      createRuntimeReason({
        category: 'operational',
        severity: 'warning',
        title: t('fleet.operationalAvailability.unknown'),
        source: 'canonical:operational-availability:unknown',
        blocking: false,
        preventsReady: true,
      }),
    );
  }
}

export function addCanonicalConnectivityAttentionReasons(input: {
  target: RuntimeReason[];
  vehicle: VehicleData;
  locale: string;
}): void {
  const runtime = input.vehicle.connectivityRuntime;
  if (!runtime) return;

  const ui = buildDashboardVehicleUiProjection(input.vehicle, input.locale === 'de' ? 'de' : 'en');
  const de = input.locale === 'de';
  const t = tFor(de ? 'de' : 'en');
  const overall = ui.connectivity.overallState.presentation;
  const primary =
    ui.operator.primaryReason.presentation?.label ??
    ui.attention.primaryReason.presentation?.label ??
    null;

  if (isCanonicalDashboardCriticalAttention(runtime, ui)) {
    const title = overall?.label ?? primary ?? (de ? 'Kritischer Hinweis' : 'Critical attention');
    input.target.push(
      createRuntimeReason({
        category: overall?.state === 'AUTHORIZATION_REQUIRED' ? 'operational' : 'telemetry',
        severity: 'critical',
        title,
        description: primary ?? undefined,
        source: `canonical:connectivity:${overall?.state ?? runtime.attentionState}`,
        blocking: false,
        preventsReady: false,
      }),
    );
    return;
  }

  if (isCanonicalDashboardWatchAttention(runtime)) {
    const title = overall?.label ?? primary ?? (de ? 'Beobachtung' : 'Watch');
    input.target.push(
      createRuntimeReason({
        category: 'telemetry',
        severity: 'warning',
        title,
        description: primary ?? undefined,
        source: `canonical:connectivity:watch:${overall?.state ?? 'WATCH'}`,
        blocking: false,
        preventsReady: false,
      }),
    );
  }
}

export function shouldIncludeInDashboardBlockedMaintenance(input: {
  vehicle: VehicleData;
  isMaintenance: boolean;
  operationalStatusUnavailable: boolean;
  hasExplicitBlockingReason: boolean;
}): boolean {
  if (input.isMaintenance || input.operationalStatusUnavailable || input.hasExplicitBlockingReason) {
    return true;
  }

  const availability = readDashboardOperationalAvailability(input.vehicle);
  if (availability === OPERATIONAL_AVAILABILITY_STATE.UNAVAILABLE) {
    return true;
  }

  const overall = input.vehicle.connectivityRuntime?.overallState;
  if (
    overall === 'DEVICE_UNPLUGGED' ||
    overall === 'INTEGRATION_ERROR' ||
    overall === 'AUTHORIZATION_REQUIRED'
  ) {
    return false;
  }

  return false;
}

/** P1.5 — Dashboard Available popup Ready pill (not timestamp/offline heuristics). */
export function isDashboardAvailablePopupReadyForRent(
  vehicle: VehicleData,
  health: VehicleHealthResponse | null | undefined,
): boolean {
  if (vehicle.cleaningStatus !== 'Clean') return false;
  if (health?.rental_blocked) return false;
  return isDashboardOperationalAvailabilityReady(vehicle);
}
