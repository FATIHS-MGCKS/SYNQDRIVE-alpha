import type { VehicleHealthResponse } from '../../lib/api';
import { isRentalBlockedUnverified } from './rental-health-availability';
import type { PriceTariffCatalog } from '../pricing/pricingTypes';
import {
  catalogCurrency,
  formatNetAsGross,
  getVehicleTariffFromCatalog,
} from '../pricing/pricingUtils';
import type { FleetStatus, VehicleData } from '../data/vehicles';
import {
  VEHICLE_OPERATIONAL_STATUS,
  formatVehicleOperationalStatusLabel,
  selectOperationalStatus,
} from './vehicle-operational-state';
import {
  evaluateBookingVehicleEligibility,
  type BookingEligibilityDenialDomain,
} from './booking-vehicle-eligibility';

export const UNCATEGORIZED_VEHICLE_LABEL = 'Nicht kategorisiert';

export type BookingVehicleHardBlockReason =
  | 'operational_gate'
  | 'rental_blocked'
  | 'no_tariff'
  | 'business_block'
  | 'booking_conflict'
  | 'rental_rules';

export interface BookingVehiclePreflight {
  fleetStatus: FleetStatus;
  /** @deprecated Legacy field — use operationalGatePass instead. Always false after P1.6. */
  offline: boolean;
  operationalGatePass: boolean;
  rentalBlocked: boolean;
  healthWarningOnly: boolean;
  noTariff: boolean;
  /** Hard-disabled in picker — backend would reject or canonical gate fails. */
  isSelectable: boolean;
  hardBlockReason: BookingVehicleHardBlockReason | null;
  blockingReason: string | null;
  cautionReason: string | null;
  muted: boolean;
  recommendedAction: string | null;
  primaryDenialDomain: BookingEligibilityDenialDomain;
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

function mapDenialDomainToHardBlock(
  domain: BookingEligibilityDenialDomain,
): BookingVehicleHardBlockReason | null {
  switch (domain) {
    case 'operational_unavailable':
    case 'operational_needs_verification':
    case 'operational_unknown':
    case 'operational_absent':
      return 'operational_gate';
    case 'rental_health':
      return 'rental_blocked';
    case 'no_tariff':
      return 'no_tariff';
    case 'business_block':
    case 'status_unreliable':
      return 'business_block';
    case 'booking_conflict':
      return 'booking_conflict';
    case 'rental_rules':
      return 'rental_rules';
    default:
      return null;
  }
}

export function resolveBookingVehiclePreflight(
  vehicle: VehicleData,
  health: VehicleHealthResponse | null | undefined,
  hasTariff: boolean,
  catalogLoading: boolean,
  options: {
    locale?: 'de' | 'en';
    bookingWindowConflict?: boolean;
    businessBlockReason?: string | null;
    rentalRuleBlockReason?: string | null;
  } = {},
): BookingVehiclePreflight {
  const locale = options.locale ?? 'de';
  const eligibility = evaluateBookingVehicleEligibility({
    vehicle,
    health,
    hasTariff,
    catalogLoading,
    locale,
    bookingWindowConflict: options.bookingWindowConflict,
    businessBlockReason: options.businessBlockReason,
    rentalRuleBlockReason: options.rentalRuleBlockReason,
  });

  const rentalBlocked = health?.rental_blocked === true;
  const rentalUnverified = health != null && isRentalBlockedUnverified(health);
  const healthWarningOnly =
    eligibility.eligible &&
    !rentalBlocked &&
    !rentalUnverified &&
    (health?.overall_state === 'warning' || health?.overall_state === 'critical');
  const noTariff = !hasTariff && !catalogLoading;

  const operationalStatus = selectOperationalStatus(vehicle);
  const isMaintenance = operationalStatus === VEHICLE_OPERATIONAL_STATUS.MAINTENANCE;
  const isRented = operationalStatus === VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED;
  const isReserved = operationalStatus === VEHICLE_OPERATIONAL_STATUS.RESERVED;

  let cautionReason: string | null = null;
  if (eligibility.eligible) {
    if (isMaintenance) {
      cautionReason = locale === 'de' ? 'In Wartung — Auswahl mit Vorsicht' : 'In maintenance — select with caution';
    } else if (isRented) {
      cautionReason = locale === 'de' ? 'Aktuell vermietet' : 'Currently rented';
    } else if (isReserved) {
      cautionReason = locale === 'de' ? 'Reserviert' : 'Reserved';
    } else if (healthWarningOnly) {
      cautionReason =
        health?.blocking_reasons?.[0] ??
        (health?.overall_state === 'critical'
          ? locale === 'de'
            ? 'Gesundheit kritisch'
            : 'Health critical'
          : locale === 'de'
            ? 'Gesundheit Warnung'
            : 'Health warning');
    }
  }

  const hardBlockReason = eligibility.eligible
    ? null
    : mapDenialDomainToHardBlock(eligibility.primaryDenialDomain);

  return {
    fleetStatus: operationalStatus,
    offline: false,
    operationalGatePass: eligibility.operationalEligible,
    rentalBlocked,
    healthWarningOnly,
    noTariff,
    isSelectable: eligibility.eligible,
    hardBlockReason,
    blockingReason: eligibility.eligible ? null : eligibility.primaryDenialReason,
    cautionReason,
    muted:
      !eligibility.operationalEligible ||
      rentalBlocked ||
      rentalUnverified ||
      isMaintenance ||
      isRented ||
      operationalStatus === VEHICLE_OPERATIONAL_STATUS.UNKNOWN,
    recommendedAction: eligibility.recommendedAction,
    primaryDenialDomain: eligibility.primaryDenialDomain,
  };
}

export function isBookingVehicleHardBlocked(
  vehicle: VehicleData,
  health: VehicleHealthResponse | null | undefined,
  hasTariff = true,
  catalogLoading = false,
  options: {
    locale?: 'de' | 'en';
    bookingWindowConflict?: boolean;
    businessBlockReason?: string | null;
    rentalRuleBlockReason?: string | null;
  } = {},
): boolean {
  return !resolveBookingVehiclePreflight(vehicle, health, hasTariff, catalogLoading, options).isSelectable;
}

export function fleetStatusLabelDe(status: FleetStatus): string {
  return formatVehicleOperationalStatusLabel(status, 'de');
}
