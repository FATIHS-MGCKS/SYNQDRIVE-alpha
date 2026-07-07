import type { VehicleHealthResponse } from '../../lib/api';
import {
  isVehicleOffline,
  VEHICLE_OFFLINE_LABEL,
  type FleetStatus,
  type VehicleData,
} from '../data/vehicles';

export const UNCATEGORIZED_VEHICLE_LABEL = 'Nicht kategorisiert';

export type BookingVehicleHardBlockReason = 'offline' | 'rental_blocked';

export interface BookingVehiclePreflight {
  fleetStatus: FleetStatus;
  offline: boolean;
  rentalBlocked: boolean;
  healthWarningOnly: boolean;
  noTariff: boolean;
  /** Hard-disabled in picker — backend would reject or telemetry unusable. */
  isSelectable: boolean;
  hardBlockReason: BookingVehicleHardBlockReason | null;
  blockingReason: string | null;
  cautionReason: string | null;
  muted: boolean;
}

export function vehicleStationId(vehicle: VehicleData): string | null {
  return vehicle.homeStationId ?? vehicle.stationId ?? null;
}

export function vehicleStationDisplay(vehicle: VehicleData): string {
  const named = (vehicle as { stationName?: string | null }).stationName;
  const label = named ?? vehicle.station ?? '';
  return label.trim() || '—';
}

export function resolveBookingVehiclePreflight(
  vehicle: VehicleData,
  health: VehicleHealthResponse | null | undefined,
  hasTariff: boolean,
  catalogLoading: boolean,
): BookingVehiclePreflight {
  const offline = isVehicleOffline(vehicle);
  const rentalBlocked = health?.rental_blocked === true;
  const healthWarningOnly =
    !rentalBlocked &&
    (health?.overall_state === 'warning' || health?.overall_state === 'critical');
  const noTariff = !hasTariff && !catalogLoading;

  const isMaintenance = vehicle.status === 'Maintenance';
  const isRented = vehicle.status === 'Active Rented';
  const isReserved = vehicle.status === 'Reserved';

  let hardBlockReason: BookingVehicleHardBlockReason | null = null;
  let blockingReason: string | null = null;
  let cautionReason: string | null = null;

  if (offline) {
    hardBlockReason = 'offline';
    blockingReason = VEHICLE_OFFLINE_LABEL;
  } else if (rentalBlocked) {
    hardBlockReason = 'rental_blocked';
    blockingReason =
      health?.blocking_reasons?.filter(Boolean).join(' · ') || 'Nicht vermietbar';
  } else if (isMaintenance) {
    cautionReason = 'In Wartung — Auswahl mit Vorsicht';
  } else if (isRented) {
    cautionReason = 'Aktuell vermietet';
  } else if (isReserved) {
    cautionReason = 'Reserviert';
  } else if (healthWarningOnly) {
    cautionReason =
      health?.blocking_reasons?.[0] ??
      (health?.overall_state === 'critical' ? 'Gesundheit kritisch' : 'Gesundheit Warnung');
  } else if (noTariff) {
    cautionReason = 'Kein aktiver Tarif';
  }

  return {
    fleetStatus: vehicle.status,
    offline,
    rentalBlocked,
    healthWarningOnly,
    noTariff,
    isSelectable: !offline && !rentalBlocked,
    hardBlockReason,
    blockingReason,
    cautionReason,
    muted: offline || rentalBlocked || isMaintenance || isRented,
  };
}

export function isBookingVehicleHardBlocked(
  vehicle: VehicleData,
  health: VehicleHealthResponse | null | undefined,
): boolean {
  return !resolveBookingVehiclePreflight(vehicle, health, true, false).isSelectable;
}

export function fleetStatusLabelDe(status: FleetStatus): string {
  switch (status) {
    case 'Available':
      return 'Verfügbar';
    case 'Reserved':
      return 'Reserviert';
    case 'Active Rented':
      return 'Aktuell vermietet';
    case 'Maintenance':
      return 'Wartung';
    default:
      return status;
  }
}
