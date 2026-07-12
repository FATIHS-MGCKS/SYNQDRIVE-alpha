import type { VehicleHealthResponse } from '../../lib/api';
import type { PriceTariffCatalog } from '../pricing/pricingTypes';
import {
  catalogCurrency,
  formatNetAsGross,
  getVehicleTariffFromCatalog,
} from '../pricing/pricingUtils';
import {
  isVehicleOffline,
  VEHICLE_OFFLINE_LABEL,
  type FleetStatus,
  type VehicleData,
} from '../data/vehicles';

export const UNCATEGORIZED_VEHICLE_LABEL = 'Nicht kategorisiert';

export type BookingVehicleHardBlockReason = 'offline' | 'rental_blocked' | 'no_tariff';

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

/** Catalog-based tariff hint for the booking picker (pickup-aware when `pickupAt` is set). */
export function vehicleHasAssignedTariff(
  catalog: PriceTariffCatalog | null,
  vehicleId: string,
  catalogLoading: boolean,
  pickupAt?: string | null,
): boolean {
  if (catalogLoading) return true;
  return Boolean(getVehicleTariffFromCatalog(catalog, vehicleId, pickupAt ?? undefined));
}

export function getVehicleDailyRateLabelFromCatalog(
  catalog: PriceTariffCatalog | null,
  vehicleId: string,
  taxRatePercent: number,
  catalogLoading: boolean,
  pickupAt?: string | null,
): string | null {
  if (catalogLoading) return null;
  const ctx = getVehicleTariffFromCatalog(catalog, vehicleId, pickupAt ?? undefined);
  if (!ctx?.version.rate) return null;
  const currency = catalogCurrency(catalog) ?? 'EUR';
  return formatNetAsGross(ctx.version.rate.dailyRateCents, taxRatePercent, currency);
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
  } else if (noTariff) {
    hardBlockReason = 'no_tariff';
    blockingReason = 'Kein aktiver Tarif zugewiesen';
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
  }

  return {
    fleetStatus: vehicle.status,
    offline,
    rentalBlocked,
    healthWarningOnly,
    noTariff,
    isSelectable: !offline && !rentalBlocked && !noTariff,
    hardBlockReason,
    blockingReason,
    cautionReason,
    muted: offline || rentalBlocked || isMaintenance || isRented,
  };
}

export function isBookingVehicleHardBlocked(
  vehicle: VehicleData,
  health: VehicleHealthResponse | null | undefined,
  hasTariff = true,
  catalogLoading = false,
): boolean {
  return !resolveBookingVehiclePreflight(vehicle, health, hasTariff, catalogLoading).isSelectable;
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
