import type { Feature, FeatureCollection, Point } from 'geojson';
import type { VehicleData } from '../data/vehicles';
import type { VehicleHealthResponse, RentalHealthModule } from '../../lib/api';
import { isVehicleOffline } from '../data/vehicles';
import {
  selectFleetActiveIsOverdue,
  selectFleetReservedIsOverdue,
} from './fleet-map-vehicle-selectors';
import {
  formatVehicleOperationalStatusLabel,
  selectOperationalStatus,
  VEHICLE_OPERATIONAL_STATUS,
  type VehicleOperationalStatus,
} from './vehicle-operational-state';
import { resolveTelemetryFreshness } from './telemetryFreshness';
import {
  hasHardRentalBlockingReasons,
  hasNonServiceCriticalHealthModule,
  isRentalHealthCritical,
  isRentalHealthWarning,
} from './vehicle-rental-health-blockers';
import { resolveCrossSurfaceRentalReadiness } from './vehicle-rental-readiness';

export type FleetVisualStatus =
  | 'ready'
  | 'active'
  | 'reserved'
  | 'maintenance'
  | 'blocked'
  | 'offline'
  | 'stale'
  | 'unknown'
  | 'no_location'
  | 'attention';

export type FleetRentalStatus =
  | 'available'
  | 'active_rented'
  | 'reserved'
  | 'maintenance'
  | 'unknown';

export type FleetReadiness =
  | 'ready'
  | 'not_ready'
  | 'blocked'
  | 'offline'
  | 'stale'
  | 'unknown';

export type FleetAttentionLevel = 'none' | 'info' | 'warning' | 'critical';

export type FleetMapTone =
  | 'ready'
  | 'active'
  | 'reserved'
  | 'maintenance'
  | 'blocked'
  | 'offline'
  | 'stale'
  | 'unknown';

export type FleetChipTone =
  | 'success'
  | 'info'
  | 'warning'
  | 'danger'
  | 'muted'
  | 'neutral';

export interface FleetVisualState {
  visualStatus: FleetVisualStatus;
  rentalStatus: FleetRentalStatus;
  readiness: FleetReadiness;
  attentionLevel: FleetAttentionLevel;
  label: string;
  shortLabel: string;
  reason?: string;
  isReady: boolean;
  isAttention: boolean;
  isOffline: boolean;
  isBlocked: boolean;
  isStale: boolean;
  hasLocation: boolean;
  sortPriority: number;
  mapTone: FleetMapTone;
  chipTone: FleetChipTone;
}

export type FleetVisualStateVehicle = Pick<
  VehicleData,
  | 'status'
  | 'operationalState'
  | 'bookingContext'
  | 'lat'
  | 'lng'
  | 'healthStatus'
  | 'onlineStatus'
  | 'lastSignal'
  | 'signalAgeMs'
  | 'isFresh'
  | 'activeIsOverdue'
  | 'reservedIsOverdue'
  | 'maintenanceUrgency'
  | 'maintenanceReasonCode'
  | 'cleaningStatus'
> & {
  heading?: number | null;
};

export interface DeriveFleetVisualStateOptions {
  rentalHealth?:
    | (Pick<
        VehicleHealthResponse,
        'rental_blocked' | 'overall_state' | 'blocking_reasons'
      > &
        Partial<Pick<VehicleHealthResponse, 'modules'>>)
    | null;
  /** When true, missing coordinates yield `no_location` instead of `ready`. */
  requireLocation?: boolean;
}

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

export const FLEET_MAP_TONE_HEX: Record<FleetMapTone, string> = {
  ready: '#3b82f6',
  active: '#8b5cf6',
  reserved: '#22c55e',
  maintenance: '#ef4444',
  blocked: '#dc2626',
  offline: '#6b7280',
  stale: '#f59e0b',
  unknown: '#9ca3af',
};

export const FLEET_MAP_LEGEND_ITEMS: ReadonlyArray<{
  mapTone: FleetMapTone;
  label: string;
}> = [
  { mapTone: 'ready', label: 'Available' },
  { mapTone: 'active', label: 'Active Rented' },
  { mapTone: 'reserved', label: 'Reserved' },
  { mapTone: 'maintenance', label: 'Maintenance' },
  { mapTone: 'blocked', label: 'Blocked' },
  { mapTone: 'offline', label: 'Offline' },
  // Amber map tone is now produced only for attention/warning vehicles, never
  // for normal standby telemetry — so the legend reads "Needs Attention".
  { mapTone: 'stale', label: 'Needs Attention' },
];

export function getFleetMapToneHex(tone: FleetMapTone): string {
  return FLEET_MAP_TONE_HEX[tone] ?? FLEET_MAP_TONE_HEX.unknown;
}

export function vehicleHasFleetLocation(
  vehicle: Pick<VehicleData, 'lat' | 'lng'>,
): boolean {
  return (
    typeof vehicle.lat === 'number' &&
    typeof vehicle.lng === 'number' &&
    Number.isFinite(vehicle.lat) &&
    Number.isFinite(vehicle.lng)
  );
}

function operationalStatusToRentalStatus(
  status: VehicleOperationalStatus,
): FleetRentalStatus {
  switch (status) {
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

function deriveRentalStatus(vehicle: FleetVisualStateVehicle): FleetRentalStatus {
  return operationalStatusToRentalStatus(selectOperationalStatus(vehicle));
}

function hasNonServiceCriticalModule(
  rentalHealth?: DeriveFleetVisualStateOptions['rentalHealth'],
): boolean {
  return hasNonServiceCriticalHealthModule(rentalHealth);
}

function isHealthCritical(
  vehicle: FleetVisualStateVehicle,
  rentalHealth?: DeriveFleetVisualStateOptions['rentalHealth'],
): boolean {
  return isRentalHealthCritical(vehicle, rentalHealth);
}

function isHealthWarning(
  vehicle: FleetVisualStateVehicle,
  rentalHealth?: DeriveFleetVisualStateOptions['rentalHealth'],
): boolean {
  return isRentalHealthWarning(vehicle, rentalHealth);
}

function hasExplicitRentalBlocker(
  rentalHealth?: DeriveFleetVisualStateOptions['rentalHealth'],
): boolean {
  return hasHardRentalBlockingReasons(rentalHealth);
}

// Soft-offline ("signal delayed") detection: 24–48h since last signal. This is
// NOT the same as STANDBY (15min–24h, perfectly normal) — STANDBY never sets
// this flag, so a quiet-but-healthy device is never downgraded or warned.
function isSignalDelayed(
  vehicle: FleetVisualStateVehicle,
  offline: boolean,
): boolean {
  if (offline) return false;
  return resolveTelemetryFreshness(vehicle).isSignalDelayed;
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
  flags: { isBlocked: boolean; isOffline: boolean; isStale: boolean },
): FleetChipTone {
  if (flags.isBlocked || attentionLevel === 'critical') return 'danger';
  if (flags.isOffline || flags.isStale) return 'muted';
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
      return { label: 'Soft Offline', shortLabel: 'Soft Off' };
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

function deriveReason(
  vehicle: FleetVisualStateVehicle,
  rentalHealth: DeriveFleetVisualStateOptions['rentalHealth'],
  flags: {
    isBlocked: boolean;
    isOffline: boolean;
    isStale: boolean;
    healthCritical: boolean;
    healthWarning: boolean;
  },
): string | undefined {
  if (flags.isBlocked && rentalHealth?.blocking_reasons?.length) {
    return rentalHealth.blocking_reasons.join(' · ');
  }
  if (flags.healthCritical) return 'Critical vehicle health';
  if (selectFleetActiveIsOverdue(vehicle)) return 'Return overdue';
  if (selectFleetReservedIsOverdue(vehicle)) return 'Pickup overdue';
  if (flags.isOffline) return 'Vehicle offline — no signal for 48h+';
  if (flags.isStale) return 'Soft Offline — no signal for 24h+';
  if (flags.healthWarning) return 'Warning health status';
  if (vehicle.maintenanceUrgency === 'urgent') return 'Urgent maintenance';
  return undefined;
}

export function deriveFleetVisualState(
  vehicle: FleetVisualStateVehicle,
  options: DeriveFleetVisualStateOptions = {},
): FleetVisualState {
  const rentalHealth = options.rentalHealth ?? null;
  const requireLocation = options.requireLocation === true;
  const hasLocation = vehicleHasFleetLocation(vehicle);
  const rentalStatus = deriveRentalStatus(vehicle);
  const operationalUnknown =
    rentalStatus === 'unknown' ||
    selectOperationalStatus(vehicle) === VEHICLE_OPERATIONAL_STATUS.UNKNOWN;
  const rentalBlocked = hasExplicitRentalBlocker(rentalHealth);
  const healthCritical = isHealthCritical(vehicle, rentalHealth);
  const healthWarning = isHealthWarning(vehicle, rentalHealth);
  const isBlocked = rentalBlocked;
  const isMaintenance =
    rentalStatus === 'maintenance' ||
    selectOperationalStatus(vehicle) === VEHICLE_OPERATIONAL_STATUS.MAINTENANCE ||
    selectOperationalStatus(vehicle) === VEHICLE_OPERATIONAL_STATUS.BLOCKED;
  const maintenanceCritical =
    isMaintenance && vehicle.maintenanceUrgency === 'urgent';
  const isOffline = isVehicleOffline(vehicle);
  // `isStale` now means soft-offline / signal_delayed (24–48h). STANDBY is never
  // problematic. Soft-offline is never the primary visual status anymore — an
  // available vehicle keeps the Available display, with delay shown separately.
  const isStale = isSignalDelayed(vehicle, isOffline);

  let visualStatus: FleetVisualStatus;
  if (operationalUnknown) {
    visualStatus = 'unknown';
  } else if (isBlocked) {
    visualStatus = 'blocked';
  } else if (isMaintenance || maintenanceCritical) {
    visualStatus = 'maintenance';
  } else if (isOffline) {
    visualStatus = 'offline';
  } else if (rentalStatus === 'active_rented') {
    visualStatus = 'active';
  } else if (rentalStatus === 'reserved') {
    visualStatus = 'reserved';
  } else if (requireLocation && !hasLocation) {
    visualStatus = 'no_location';
  } else if (
    rentalStatus === 'available' &&
    (healthCritical || healthWarning)
  ) {
    visualStatus = 'attention';
  } else if (rentalStatus === 'available') {
    visualStatus = 'ready';
  } else {
    visualStatus = 'unknown';
  }

  let attentionLevel: FleetAttentionLevel = 'none';
  if (
    isBlocked ||
    healthCritical ||
    maintenanceCritical ||
    selectFleetActiveIsOverdue(vehicle)
  ) {
    attentionLevel = 'critical';
  } else if (
    isOffline ||
    healthWarning ||
    vehicle.maintenanceUrgency === 'planned'
  ) {
    attentionLevel = 'warning';
  } else if (operationalUnknown) {
    attentionLevel = 'info';
  } else if (isStale || rentalStatus === 'reserved') {
    // Soft-offline / signal delayed is only a low-priority (info) hint.
    attentionLevel = 'info';
  }

  let readiness: FleetReadiness;
  const crossSurface = resolveCrossSurfaceRentalReadiness(vehicle, { rentalHealth });
  if (operationalUnknown) {
    readiness = 'unknown';
  } else if (crossSurface.readiness === 'blocked') {
    readiness = 'blocked';
  } else if (crossSurface.isTelemetryBlocked) {
    readiness = 'offline';
  } else if (crossSurface.readiness === 'ready') {
    readiness =
      requireLocation && !hasLocation && rentalStatus === 'available' ? 'not_ready' : 'ready';
  } else if (crossSurface.readiness === 'not_ready') {
    readiness = 'not_ready';
  } else {
    readiness = 'unknown';
  }

  const { label, shortLabel } = labelForVisualStatus(visualStatus, rentalStatus);
  const mapTone = mapVisualStatusToMapTone(visualStatus);
  const chipTone = deriveChipTone(visualStatus, attentionLevel, {
    isBlocked,
    isOffline,
    isStale,
  });
  const reason = deriveReason(vehicle, rentalHealth, {
    isBlocked,
    isOffline,
    isStale,
    healthCritical,
    healthWarning,
  });

  return {
    visualStatus,
    rentalStatus,
    readiness,
    attentionLevel,
    label,
    shortLabel,
    reason,
    isReady: readiness === 'ready',
    isAttention: attentionLevel !== 'none',
    isOffline,
    isBlocked,
    isStale,
    hasLocation,
    sortPriority: SORT_PRIORITY[visualStatus],
    mapTone,
    chipTone,
  };
}

export interface FleetMapFeatureVisualProperties {
  vehicleId: string;
  label: string;
  status: VehicleData['status'];
  mapTone: FleetMapTone;
  visualStatus: FleetVisualStatus;
  shortLabel: string;
  heading: number;
  stationId: string | null;
}

export type FleetMapVisualGeoJson = FeatureCollection<
  Point,
  FleetMapFeatureVisualProperties
>;

export function buildFleetMapGeoJson(
  vehicles: Array<
    FleetVisualStateVehicle &
      Pick<VehicleData, 'id' | 'license' | 'model' | 'stationId'>
  >,
  options?: {
    getRentalHealth?: (
      vehicleId: string,
    ) => Pick<
      VehicleHealthResponse,
      'rental_blocked' | 'overall_state' | 'blocking_reasons'
    > | null;
  },
): FleetMapVisualGeoJson {
  const getHealth = options?.getRentalHealth;
  const features: Array<Feature<Point, FleetMapFeatureVisualProperties>> = [];

  for (const vehicle of vehicles) {
    if (!vehicleHasFleetLocation(vehicle)) continue;

    const visual = deriveFleetVisualState(vehicle, {
      rentalHealth: getHealth?.(vehicle.id) ?? null,
      requireLocation: true,
    });

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [vehicle.lng!, vehicle.lat!],
      },
      properties: {
        vehicleId: vehicle.id,
        label: vehicle.license || vehicle.model,
        status: selectOperationalStatus(vehicle),
        mapTone: visual.mapTone,
        visualStatus: visual.visualStatus,
        shortLabel: visual.shortLabel,
        heading: vehicle.heading ?? 0,
        stationId: vehicle.stationId ?? null,
      },
    });
  }

  return { type: 'FeatureCollection', features };
}
