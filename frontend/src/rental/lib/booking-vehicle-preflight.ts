import type { VehicleHealthResponse } from '../../lib/api';
import { isRentalBlockedUnverified } from './rental-health-availability';
import type { PriceTariffCatalog } from '../pricing/pricingTypes';
import {
  catalogCurrency,
  formatNetAsGross,
  getVehicleTariffFromCatalog,
} from '../pricing/pricingUtils';
import type { FleetStatus, VehicleData } from '../data/vehicles';
import { isVehicleOffline } from '../data/vehicles';
import {
  VEHICLE_OPERATIONAL_STATUS,
  formatVehicleOperationalStatusLabel,
  selectIsStatusReliable,
  selectOperationalStatus,
} from './vehicle-operational-state';
import {
  bookingVehicleCurrentlyRentedCautionLabel,
  bookingVehicleHealthCriticalCautionLabel,
  bookingVehicleHealthWarningCautionLabel,
  bookingVehicleMaintenanceCautionLabel,
  bookingVehicleNoActiveTariffLabel,
  bookingVehicleNotRentableFallbackLabel,
  bookingVehicleOfflineLabel,
  bookingVehicleRentalUnverifiedLabel,
  bookingVehicleReservedCautionLabel,
  bookingVehicleStatusUnavailableLabel,
  resolveBookingVehiclePreflightLocale,
} from './booking-vehicle-preflight-presentation-i18n';

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

export interface BookingVehiclePreflightOptions {
  locale?: string | null;
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
  options?: BookingVehiclePreflightOptions,
): BookingVehiclePreflight {
  const locale = resolveBookingVehiclePreflightLocale(options?.locale);
  const offline = isVehicleOffline(vehicle);
  const rentalBlocked = health?.rental_blocked === true;
  const rentalUnverified = health != null && isRentalBlockedUnverified(health);
  const healthWarningOnly =
    !rentalBlocked &&
    !rentalUnverified &&
    (health?.overall_state === 'warning' || health?.overall_state === 'critical');
  const noTariff = !hasTariff && !catalogLoading;

  const operationalStatus = selectOperationalStatus(vehicle);
  const statusUnreliable = !selectIsStatusReliable(vehicle);

  const isMaintenance = operationalStatus === VEHICLE_OPERATIONAL_STATUS.MAINTENANCE;
  const isRented = operationalStatus === VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED;
  const isReserved = operationalStatus === VEHICLE_OPERATIONAL_STATUS.RESERVED;
  const isUnknown = operationalStatus === VEHICLE_OPERATIONAL_STATUS.UNKNOWN;

  let hardBlockReason: BookingVehicleHardBlockReason | null = null;
  let blockingReason: string | null = null;
  let cautionReason: string | null = null;

  if (offline) {
    hardBlockReason = 'offline';
    blockingReason = bookingVehicleOfflineLabel(locale);
  } else if (rentalBlocked) {
    hardBlockReason = 'rental_blocked';
    blockingReason =
      health?.blocking_reasons?.filter(Boolean).join(' · ') ||
      bookingVehicleNotRentableFallbackLabel(locale);
  } else if (rentalUnverified) {
    hardBlockReason = 'rental_blocked';
    blockingReason = bookingVehicleRentalUnverifiedLabel(locale);
  } else if (noTariff) {
    hardBlockReason = 'no_tariff';
    blockingReason = bookingVehicleNoActiveTariffLabel(locale);
  } else if (isUnknown || statusUnreliable) {
    hardBlockReason = 'rental_blocked';
    blockingReason = bookingVehicleStatusUnavailableLabel(locale);
  } else if (isMaintenance) {
    cautionReason = bookingVehicleMaintenanceCautionLabel(locale);
  } else if (isRented) {
    cautionReason = bookingVehicleCurrentlyRentedCautionLabel(locale);
  } else if (isReserved) {
    cautionReason = bookingVehicleReservedCautionLabel(locale);
  } else if (healthWarningOnly) {
    cautionReason =
      health?.blocking_reasons?.[0] ??
      (health?.overall_state === 'critical'
        ? bookingVehicleHealthCriticalCautionLabel(locale)
        : bookingVehicleHealthWarningCautionLabel(locale));
  }

  return {
    fleetStatus: operationalStatus,
    offline,
    rentalBlocked,
    healthWarningOnly,
    noTariff,
    isSelectable:
      !offline &&
      !rentalBlocked &&
      !rentalUnverified &&
      !noTariff &&
      !isUnknown &&
      !statusUnreliable,
    hardBlockReason,
    blockingReason,
    cautionReason,
    muted: offline || rentalBlocked || rentalUnverified || isMaintenance || isRented || isUnknown,
  };
}

export function isBookingVehicleHardBlocked(
  vehicle: VehicleData,
  health: VehicleHealthResponse | null | undefined,
  hasTariff = true,
  catalogLoading = false,
  options?: BookingVehiclePreflightOptions,
): boolean {
  return !resolveBookingVehiclePreflight(vehicle, health, hasTariff, catalogLoading, options)
    .isSelectable;
}

/** @deprecated Use `formatVehicleOperationalStatusLabel(status, locale)`. */
export function fleetStatusLabelDe(status: FleetStatus): string {
  return formatVehicleOperationalStatusLabel(status, 'de');
}
