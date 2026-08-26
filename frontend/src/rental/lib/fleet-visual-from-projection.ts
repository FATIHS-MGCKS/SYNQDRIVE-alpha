/**
 * P1.3 — Map marker / fleet visual derivation from P1.2 UI projection.
 *
 * Precedence (highest first):
 * 1. Critical / action-required canonical condition (attention, UNAVAILABLE, DEVICE_UNPLUGGED)
 * 2. Operationally unavailable
 * 3. Needs verification
 * 4. Active business workflow (rented / reserved / maintenance)
 * 5. Available
 * 6. Unknown / no data
 *
 * Standby telemetry never downgrades an AVAILABLE vehicle to offline/unavailable.
 */
import type { OverallConnectivityState } from '../../lib/api';
import type { VehicleOperationalUiProjection } from './operational-projection';
import { OPERATIONAL_AVAILABILITY_STATE } from './operational-availability/types';
import { HEALTH_EVALUABILITY_STATE } from './fleet-health-evaluation/types';
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
): { label: string; shortLabel: string } {
  switch (visualStatus) {
    case 'ready':
      return {
        label: formatVehicleOperationalStatusLabel(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, 'en'),
        shortLabel: 'Avail.',
      };
    case 'active':
      return {
        label: formatVehicleOperationalStatusLabel(VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED, 'en'),
        shortLabel: 'Active',
      };
    case 'reserved':
      return {
        label: formatVehicleOperationalStatusLabel(VEHICLE_OPERATIONAL_STATUS.RESERVED, 'en'),
        shortLabel: 'Reserved',
      };
    case 'maintenance':
      return {
        label: formatVehicleOperationalStatusLabel(VEHICLE_OPERATIONAL_STATUS.MAINTENANCE, 'en'),
        shortLabel: 'Service',
      };
    case 'blocked':
      return { label: 'Blocked', shortLabel: 'Blocked' };
    case 'offline':
      return { label: 'Offline', shortLabel: 'Offline' };
    case 'stale':
      return { label: 'Needs Verification', shortLabel: 'Verify' };
    case 'no_location':
      return { label: 'No Location', shortLabel: 'No GPS' };
    case 'attention':
      return { label: 'Needs Attention', shortLabel: 'Attention' };
    default:
      return {
        label:
          rentalStatus === 'unknown'
            ? formatVehicleOperationalStatusLabel(VEHICLE_OPERATIONAL_STATUS.UNKNOWN, 'en')
            : 'Unavailable',
        shortLabel: 'Unknown',
      };
  }
}

function readOverallState(ui: VehicleOperationalUiProjection): OverallConnectivityState | undefined {
  return ui.connectivity.overallState.presentation?.state;
}

function readAvailabilityState(ui: VehicleOperationalUiProjection) {
  return ui.availability.presentation?.state;
}

function readAttentionState(ui: VehicleOperationalUiProjection) {
  return ui.attention.attention.presentation?.state ?? ui.operator.attention.presentation?.state;
}

function isCriticalAttention(ui: VehicleOperationalUiProjection): boolean {
  const attention = readAttentionState(ui);
  return attention === 'CRITICAL' || attention === 'ACTION_REQUIRED';
}

function isHealthAttention(ui: VehicleOperationalUiProjection): boolean {
  const health = ui.health.presentation;
  if (!health) return false;
  if (!health.isEvaluable) return true;
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

export function deriveFleetVisualStateFromUiProjection(
  vehicle: FleetVisualStateVehicle,
  ui: VehicleOperationalUiProjection,
  options: { requireLocation?: boolean } = {},
): FleetVisualState {
  const requireLocation = options.requireLocation === true;
  const hasLocation = vehicleHasFleetLocation(vehicle);
  const rentalStatus = operationalStatusToRentalStatus(vehicle);
  const businessStatus = selectOperationalStatus(vehicle);
  const availability = readAvailabilityState(ui);
  const overall = readOverallState(ui);
  const attentionState = readAttentionState(ui);

  const operationalUnknown =
    rentalStatus === 'unknown' ||
    businessStatus === VEHICLE_OPERATIONAL_STATUS.UNKNOWN ||
    availability === OPERATIONAL_AVAILABILITY_STATE.UNKNOWN ||
    (availability === undefined && ui.availability.presence === 'absent');

  const isBlocked =
    availability === OPERATIONAL_AVAILABILITY_STATE.UNAVAILABLE ||
    isConnectivityCritical(overall) ||
    attentionState === 'CRITICAL';

  const isMaintenance =
    rentalStatus === 'maintenance' ||
    businessStatus === VEHICLE_OPERATIONAL_STATUS.MAINTENANCE ||
    businessStatus === VEHICLE_OPERATIONAL_STATUS.BLOCKED;

  const needsVerification = availability === OPERATIONAL_AVAILABILITY_STATE.NEEDS_VERIFICATION;

  const healthAttention = isHealthAttention(ui);

  // Offline map tone only when canonical connectivity says OFFLINE and availability
  // is not explicitly AVAILABLE (canonical availability wins over legacy timestamps).
  const isOffline =
    isConnectivityOffline(overall) &&
    availability !== OPERATIONAL_AVAILABILITY_STATE.AVAILABLE;

  let visualStatus: FleetVisualStatus;
  if (operationalUnknown) {
    visualStatus = 'unknown';
  } else if (isBlocked || overall === 'DEVICE_UNPLUGGED') {
    visualStatus = 'blocked';
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
  } else if (healthAttention || isCriticalAttention(ui) || overall === 'SOFT_OFFLINE') {
    visualStatus = 'attention';
  } else if (rentalStatus === 'available' || availability === OPERATIONAL_AVAILABILITY_STATE.AVAILABLE) {
    visualStatus = 'ready';
  } else {
    visualStatus = 'unknown';
  }

  let attentionLevel: FleetAttentionLevel = 'none';
  if (isBlocked || isCriticalAttention(ui) || selectFleetActiveIsOverdue(vehicle)) {
    attentionLevel = 'critical';
  } else if (isOffline || needsVerification || healthAttention || attentionState === 'WATCH') {
    attentionLevel = 'warning';
  } else if (operationalUnknown) {
    attentionLevel = 'info';
  } else if (rentalStatus === 'reserved') {
    attentionLevel = 'info';
  }

  let readiness: FleetReadiness;
  if (operationalUnknown) {
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

  const { label, shortLabel } = labelForVisualStatus(visualStatus, rentalStatus);
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
