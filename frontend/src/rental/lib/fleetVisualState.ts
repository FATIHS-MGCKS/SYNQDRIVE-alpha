import type { Feature, FeatureCollection, Point } from 'geojson';
import type { VehicleData } from '../data/vehicles';
import type { VehicleHealthResponse, RentalHealthModule } from '../../lib/api';
import { isVehicleOffline } from '../data/vehicles';
import { resolveTelemetryFreshness } from './telemetryFreshness';

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
  | 'lat'
  | 'lng'
  | 'healthStatus'
  | 'onlineStatus'
  | 'lastSignal'
  | 'signalAgeMs'
  | 'isFresh'
  | 'activeBookingId'
  | 'reservedBookingId'
  | 'activeIsOverdue'
  | 'reservedIsOverdue'
  | 'maintenanceUrgency'
  | 'maintenanceReasonCode'
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

function deriveRentalStatus(vehicle: FleetVisualStateVehicle): FleetRentalStatus {
  switch (vehicle.status) {
    case 'Active Rented':
      return vehicle.activeBookingId ? 'active_rented' : 'available';
    case 'Reserved':
      return vehicle.reservedBookingId ? 'reserved' : 'available';
    case 'Maintenance':
      return 'maintenance';
    case 'Available':
      return 'available';
    default:
      return 'unknown';
  }
}

function hasNonServiceCriticalModule(
  rentalHealth?: DeriveFleetVisualStateOptions['rentalHealth'],
): boolean {
  if (!rentalHealth?.modules) return false;
  for (const [name, mod] of Object.entries(rentalHealth.modules) as Array<
    [keyof VehicleHealthResponse['modules'], RentalHealthModule]
  >) {
    if (name === 'service_compliance') continue;
    if (mod.state === 'critical') return true;
  }
  return false;
}

function isHealthCritical(
  vehicle: FleetVisualStateVehicle,
  rentalHealth?: DeriveFleetVisualStateOptions['rentalHealth'],
): boolean {
  if (rentalHealth?.rental_blocked) return true;
  if (hasNonServiceCriticalModule(rentalHealth)) return true;
  return vehicle.healthStatus === 'Critical';
}

function isHealthWarning(
  vehicle: FleetVisualStateVehicle,
  rentalHealth?: DeriveFleetVisualStateOptions['rentalHealth'],
): boolean {
  return (
    rentalHealth?.overall_state === 'warning' || vehicle.healthStatus === 'Warning'
  );
}

function hasExplicitRentalBlocker(
  rentalHealth?: DeriveFleetVisualStateOptions['rentalHealth'],
): boolean {
  const reasons = rentalHealth?.blocking_reasons ?? [];
  if (reasons.length === 0) return rentalHealth?.rental_blocked === true;
  return reasons.some((reason) => {
    const normalized = reason.toLowerCase();
    if (
      normalized.includes('tüv') ||
      normalized.includes('tuv') ||
      normalized.includes('bokraft')
    ) {
      return true;
    }
    return !normalized.includes('service') && !normalized.includes('wartung');
  });
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
      return { label: 'Available', shortLabel: 'Avail.' };
    case 'active':
      return { label: 'Active Rented', shortLabel: 'Active' };
    case 'reserved':
      return { label: 'Reserved', shortLabel: 'Reserved' };
    case 'maintenance':
      return { label: 'Maintenance', shortLabel: 'Service' };
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
        label: rentalStatus === 'unknown' ? 'Unknown' : 'Unavailable',
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
  if (vehicle.activeIsOverdue) return 'Return overdue';
  if (vehicle.reservedIsOverdue) return 'Pickup overdue';
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
  const rentalBlocked = hasExplicitRentalBlocker(rentalHealth);
  const healthCritical = isHealthCritical(vehicle, rentalHealth);
  const healthWarning = isHealthWarning(vehicle, rentalHealth);
  const isBlocked = rentalBlocked;
  const isMaintenance =
    rentalStatus === 'maintenance' ||
    vehicle.status === 'Maintenance';
  const maintenanceCritical =
    isMaintenance && vehicle.maintenanceUrgency === 'urgent';
  const isOffline = isVehicleOffline(vehicle);
  // `isStale` now means soft-offline / signal_delayed (24–48h). STANDBY is never
  // problematic. Soft-offline is never the primary visual status anymore — an
  // available vehicle keeps the Available display, with delay shown separately.
  const isStale = isSignalDelayed(vehicle, isOffline);

  let visualStatus: FleetVisualStatus;
  if (isBlocked) {
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
    vehicle.activeIsOverdue
  ) {
    attentionLevel = 'critical';
  } else if (
    isOffline ||
    healthWarning ||
    vehicle.maintenanceUrgency === 'planned'
  ) {
    attentionLevel = 'warning';
  } else if (isStale || rentalStatus === 'reserved') {
    // Soft-offline / signal delayed is only a low-priority (info) hint.
    attentionLevel = 'info';
  }

  let readiness: FleetReadiness;
  if (isBlocked) {
    readiness = 'blocked';
  } else if (isOffline) {
    readiness = 'offline';
  } else if (
    rentalStatus === 'available' &&
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
        status: vehicle.status,
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
