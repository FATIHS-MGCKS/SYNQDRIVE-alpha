/**
 * P1.3 — Map marker / fleet visual derivation from P1.2 UI projection.
 *
 * Precedence (highest first):
 * 1. Critical / action-required canonical condition (attention CRITICAL, UNAVAILABLE, DEVICE_UNPLUGGED, AUTHORIZATION_REQUIRED, INTEGRATION_ERROR)
 * 2. Operationally unavailable
 * 3. Needs verification
 * 4. Active business workflow (rented / reserved / maintenance)
 * 5. Available
 * 6. Unknown / no data
 *
 * Standby telemetry never downgrades an AVAILABLE vehicle to offline/unavailable.
 * Explicit critical connectivity evidence outranks availability UNKNOWN/absent.
 */
import type { OverallConnectivityState } from '../../lib/api';
import { overallStateLabel } from '../components/fleet-connectivity/fleet-connectivity.presentation';
import { de } from '../i18n/translations/de';
import { en } from '../i18n/translations/en';
import type { TranslationKey } from '../i18n/translations/en';
import type { VehicleOperationalUiProjection } from './operational-projection';
import { OPERATIONAL_AVAILABILITY_STATE } from './operational-availability/types';
import {
  selectFleetActiveIsOverdue,
  selectFleetReservedIsOverdue,
} from './fleet-map-vehicle-selectors';
import {
  formatVehicleOperationalStatusLabel,
  selectOperationalStatus,
  VEHICLE_OPERATIONAL_STATUS,
} from './vehicle-operational-state';
import type {
  FleetAttentionLevel,
  FleetChipTone,
  FleetMapTone,
  FleetReadiness,
  FleetRentalStatus,
  FleetVisualState,
  FleetVisualStateVehicle,
  FleetVisualStatus,
} from './fleetVisualState';
import { vehicleHasFleetLocation } from './fleetVisualState';

const SORT_PRIORITY: Record<FleetVisualStatus, number> = {
  blocked: 0,
  maintenance: 10,
  offline: 20,
  stale: 30,
  attention: 40,
  active: 50,
  reserved: 60,
  ready: 70,
  no_location: 80,
  unknown: 90,
};

export type FleetVisualProjectionOptions = {
  requireLocation?: boolean;
  locale?: 'en' | 'de';
  t?: (key: TranslationKey) => string;
};

function operationalStatusToRentalStatus(
  vehicle: FleetVisualStateVehicle,
): FleetRentalStatus {
  switch (selectOperationalStatus(vehicle)) {
    case VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED:
      return 'active_rented';
    case VEHICLE_OPERATIONAL_STATUS.RESERVED:
      return 'reserved';
    case VEHICLE_OPERATIONAL_STATUS.MAINTENANCE:
    case VEHICLE_OPERATIONAL_STATUS.BLOCKED:
      return 'maintenance';
    case VEHICLE_OPERATIONAL_STATUS.AVAILABLE:
      return 'available';
    default:
      return 'unknown';
  }
}

function mapVisualStatusToMapTone(visualStatus: FleetVisualStatus): FleetMapTone {
  if (visualStatus === 'attention') return 'stale';
  if (visualStatus === 'no_location') return 'unknown';
  if (
    visualStatus === 'ready' ||
    visualStatus === 'active' ||
    visualStatus === 'reserved' ||
    visualStatus === 'maintenance' ||
    visualStatus === 'blocked' ||
    visualStatus === 'offline' ||
    visualStatus === 'stale' ||
    visualStatus === 'unknown'
  ) {
    return visualStatus;
  }
  return 'unknown';
}

function deriveChipTone(
  visualStatus: FleetVisualStatus,
  attentionLevel: FleetAttentionLevel,
  flags: { isBlocked: boolean; isOffline: boolean },
): FleetChipTone {
  if (flags.isBlocked || attentionLevel === 'critical') return 'danger';
  if (flags.isOffline) return 'muted';
  if (attentionLevel === 'warning') return 'warning';
  if (visualStatus === 'ready') return 'success';
  if (visualStatus === 'active') return 'info';
  if (visualStatus === 'reserved') return 'warning';
  if (visualStatus === 'maintenance') return 'danger';
  return 'neutral';
}

function labelForVisualStatus(
  visualStatus: FleetVisualStatus,
  rentalStatus: FleetRentalStatus,
  ui: VehicleOperationalUiProjection,
  locale: 'en' | 'de',
  t: (key: TranslationKey) => string,
): { label: string; shortLabel: string } {
  const availabilityLabel = ui.availability.presentation?.label;
  const overall = ui.connectivity.overallState.presentation?.state;
  const connectivityLabel = overall ? overallStateLabel(overall, t) : undefined;

  const withShort = (label: string) => ({ label, shortLabel: label });

  switch (visualStatus) {
    case 'ready':
      return withShort(
        availabilityLabel ??
          formatVehicleOperationalStatusLabel(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, locale),
      );
    case 'active':
      return withShort(
        formatVehicleOperationalStatusLabel(VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED, locale),
      );
    case 'reserved':
      return withShort(
        formatVehicleOperationalStatusLabel(VEHICLE_OPERATIONAL_STATUS.RESERVED, locale),
      );
    case 'maintenance':
      return withShort(
        formatVehicleOperationalStatusLabel(VEHICLE_OPERATIONAL_STATUS.MAINTENANCE, locale),
      );
    case 'blocked':
      return withShort(
        availabilityLabel ??
          connectivityLabel ??
          formatVehicleOperationalStatusLabel(VEHICLE_OPERATIONAL_STATUS.BLOCKED, locale),
      );
    case 'offline':
      return withShort(connectivityLabel ?? t('fleetConnectivity.state.OFFLINE'));
    case 'stale':
      return withShort(
        availabilityLabel ?? t('fleet.operationalAvailability.needsVerification'),
      );
    case 'no_location':
      return withShort(t('fleetConnectivity.detail.locationUnavailable'));
    case 'attention':
      return withShort(
        connectivityLabel ?? t('communication.dashboard.needsAttention'),
      );
    default:
      return withShort(
        rentalStatus === 'unknown'
          ? formatVehicleOperationalStatusLabel(VEHICLE_OPERATIONAL_STATUS.UNKNOWN, locale)
          : (availabilityLabel ??
              connectivityLabel ??
              formatVehicleOperationalStatusLabel(VEHICLE_OPERATIONAL_STATUS.UNKNOWN, locale)),
      );
  }
}

function readOverallState(ui: VehicleOperationalUiProjection): OverallConnectivityState | undefined {
  return ui.connectivity.overallState.presentation?.state;
}

function readAvailabilityState(ui: VehicleOperationalUiProjection) {
  return ui.availability.presentation?.state;
}

function readAttentionState(ui: VehicleOperationalUiProjection) {
  const presentationAttention = ui.attention.attention.presentation?.state;
  const operatorAttention = ui.operator.attention.presentation?.state;

  for (const state of [presentationAttention, operatorAttention]) {
    if (state === 'CRITICAL' || state === 'ACTION_REQUIRED') return state;
  }
  for (const state of [presentationAttention, operatorAttention]) {
    if (state && state !== 'NONE') return state;
  }
  return undefined;
}

function isCriticalAttention(ui: VehicleOperationalUiProjection): boolean {
  const attention = readAttentionState(ui);
  return attention === 'CRITICAL' || attention === 'ACTION_REQUIRED';
}

function isHealthMechanicalAttention(ui: VehicleOperationalUiProjection): boolean {
  const health = ui.health.presentation;
  if (!health?.isEvaluable) return false;
  const condition = health.condition.presentation?.state;
  return condition === 'critical' || condition === 'warning';
}

function isConnectivityCritical(overall?: OverallConnectivityState): boolean {
  return (
    overall === 'DEVICE_UNPLUGGED' ||
    overall === 'INTEGRATION_ERROR' ||
    overall === 'AUTHORIZATION_REQUIRED'
  );
}

function isConnectivityOffline(overall?: OverallConnectivityState): boolean {
  return overall === 'OFFLINE';
}

function hasCanonicalCriticalEvidence(
  availability: ReturnType<typeof readAvailabilityState>,
  overall: OverallConnectivityState | undefined,
  attentionState: ReturnType<typeof readAttentionState>,
): boolean {
  return (
    availability === OPERATIONAL_AVAILABILITY_STATE.UNAVAILABLE ||
    isConnectivityCritical(overall) ||
    overall === 'DEVICE_UNPLUGGED' ||
    attentionState === 'CRITICAL'
  );
}

function isOperationalUnknown(
  ui: VehicleOperationalUiProjection,
  rentalStatus: FleetRentalStatus,
  businessStatus: ReturnType<typeof selectOperationalStatus>,
  availability: ReturnType<typeof readAvailabilityState>,
  overall: OverallConnectivityState | undefined,
  hasCriticalEvidence: boolean,
): boolean {
  if (hasCriticalEvidence) return false;

  const availabilityAbsent =
    availability === undefined && ui.availability.presence === 'absent';
  const availabilityUnknown = availability === OPERATIONAL_AVAILABILITY_STATE.UNKNOWN;
  const connectivityAbsent =
    overall === undefined && ui.connectivity.overallState.presence === 'absent';
  const connectivityUnknown = overall === 'UNKNOWN';

  if (availabilityUnknown) return true;
  if (availabilityAbsent && (connectivityAbsent || connectivityUnknown)) return true;
  if (connectivityUnknown && availabilityAbsent) return true;

  return (
    rentalStatus === 'unknown' || businessStatus === VEHICLE_OPERATIONAL_STATUS.UNKNOWN
  );
}

export function deriveFleetVisualStateFromUiProjection(
  vehicle: FleetVisualStateVehicle,
  ui: VehicleOperationalUiProjection,
  options: FleetVisualProjectionOptions = {},
): FleetVisualState {
  const requireLocation = options.requireLocation === true;
  const locale = options.locale ?? 'de';
  const dict = locale === 'de' ? de : en;
  const t = options.t ?? ((key: TranslationKey) => dict[key] ?? key);
  const hasLocation = vehicleHasFleetLocation(vehicle);
  const rentalStatus = operationalStatusToRentalStatus(vehicle);
  const businessStatus = selectOperationalStatus(vehicle);
  const availability = readAvailabilityState(ui);
  const overall = readOverallState(ui);
  const attentionState = readAttentionState(ui);

  const hasCriticalEvidence = hasCanonicalCriticalEvidence(availability, overall, attentionState);
  const operationalUnknown = isOperationalUnknown(
    ui,
    rentalStatus,
    businessStatus,
    availability,
    overall,
    hasCriticalEvidence,
  );

  const isBlocked = hasCriticalEvidence;
  const isMaintenance =
    rentalStatus === 'maintenance' ||
    businessStatus === VEHICLE_OPERATIONAL_STATUS.MAINTENANCE ||
    businessStatus === VEHICLE_OPERATIONAL_STATUS.BLOCKED;
  const needsVerification = availability === OPERATIONAL_AVAILABILITY_STATE.NEEDS_VERIFICATION;
  const healthMechanicalAttention = isHealthMechanicalAttention(ui);

  const isOffline =
    isConnectivityOffline(overall) &&
    availability !== OPERATIONAL_AVAILABILITY_STATE.AVAILABLE;

  let visualStatus: FleetVisualStatus;
  if (hasCriticalEvidence) {
    visualStatus = 'blocked';
  } else if (attentionState === 'ACTION_REQUIRED') {
    visualStatus = 'attention';
  } else if (isMaintenance) {
    visualStatus = 'maintenance';
  } else if (needsVerification) {
    visualStatus = 'stale';
  } else if (isOffline) {
    visualStatus = 'offline';
  } else if (rentalStatus === 'active_rented') {
    visualStatus = 'active';
  } else if (rentalStatus === 'reserved') {
    visualStatus = 'reserved';
  } else if (requireLocation && !hasLocation) {
    visualStatus = 'no_location';
  } else if (healthMechanicalAttention || overall === 'SOFT_OFFLINE' || attentionState === 'WATCH') {
    visualStatus = 'attention';
  } else if (operationalUnknown) {
    visualStatus = 'unknown';
  } else if (
    rentalStatus === 'available' ||
    availability === OPERATIONAL_AVAILABILITY_STATE.AVAILABLE
  ) {
    visualStatus = 'ready';
  } else {
    visualStatus = 'unknown';
  }

  let attentionLevel: FleetAttentionLevel = 'none';
  if (isBlocked || isCriticalAttention(ui) || selectFleetActiveIsOverdue(vehicle)) {
    attentionLevel = 'critical';
  } else if (isOffline || needsVerification || healthMechanicalAttention || attentionState === 'WATCH') {
    attentionLevel = 'warning';
  } else if (operationalUnknown) {
    attentionLevel = 'info';
  } else if (rentalStatus === 'reserved') {
    attentionLevel = 'info';
  }

  let readiness: FleetReadiness;
  if (operationalUnknown && !hasCriticalEvidence) {
    readiness = 'unknown';
  } else if (isBlocked) {
    readiness = 'blocked';
  } else if (isOffline) {
    readiness = 'offline';
  } else if (
    (rentalStatus === 'available' || availability === OPERATIONAL_AVAILABILITY_STATE.AVAILABLE) &&
    (!requireLocation || hasLocation)
  ) {
    readiness = 'ready';
  } else if (rentalStatus === 'available') {
    readiness = 'not_ready';
  } else {
    readiness = 'unknown';
  }

  const { label, shortLabel } = labelForVisualStatus(
    visualStatus,
    rentalStatus,
    ui,
    locale,
    t,
  );
  const mapTone = mapVisualStatusToMapTone(visualStatus);
  const chipTone = deriveChipTone(visualStatus, attentionLevel, { isBlocked, isOffline });

  const reason =
    ui.operator.primaryReason.presentation?.label ??
    ui.availability.presentation?.primaryReason.presentation?.label ??
    undefined;

  return {
    visualStatus,
    rentalStatus,
    readiness,
    attentionLevel,
    label,
    shortLabel,
    reason: reason ?? undefined,
    isReady: readiness === 'ready',
    isAttention: attentionLevel !== 'none',
    isOffline,
    isBlocked,
    isStale: needsVerification || attentionLevel === 'warning',
    hasLocation,
    sortPriority: SORT_PRIORITY[visualStatus],
    mapTone,
    chipTone,
  };
}
