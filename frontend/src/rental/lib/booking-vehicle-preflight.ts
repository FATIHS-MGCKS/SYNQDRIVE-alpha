import type { VehicleHealthResponse } from '../../lib/api';
import type { BookingUiRow } from '../components/bookings/bookingTypes';
import { de } from '../i18n/translations/de';
import { en } from '../i18n/translations/en';
import type { TranslationKey } from '../i18n/translations/en';
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
import { hasBookingWindowConflict } from './booking-window-conflict';

export const UNCATEGORIZED_VEHICLE_LABEL = 'Nicht kategorisiert';

export type BookingVehicleHardBlockReason =
  | 'operational_gate'
  | 'rental_blocked'
  | 'no_tariff'
  | 'business_block'
  | 'booking_conflict'
  | 'rental_rules';

export interface BookingVehiclePreflightOptions {
  locale?: 'de' | 'en';
  bookingWindowConflict?: boolean;
  businessBlockReason?: string | null;
  rentalRuleBlockReason?: string | null;
  healthLoading?: boolean;
  healthRecordAbsent?: boolean;
  allowHealthBypass?: boolean;
}

export interface BookingVehiclePreflightContextInput extends BookingVehiclePreflightOptions {
  vehicle: VehicleData;
  health: VehicleHealthResponse | null | undefined;
  hasTariff: boolean;
  catalogLoading: boolean;
  bookingRows?: BookingUiRow[];
  pickupAt?: string | null;
  returnAt?: string | null;
  excludeBookingId?: string | null;
}

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

function tFor(locale: 'de' | 'en'): (key: TranslationKey) => string {
  const dict = locale === 'de' ? de : en;
  return (key: TranslationKey) => dict[key] ?? key;
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

export function resolveBookingWindowConflictForVehicle(
  input: Pick<
    BookingVehiclePreflightContextInput,
    'vehicle' | 'bookingRows' | 'pickupAt' | 'returnAt' | 'excludeBookingId' | 'bookingWindowConflict'
  >,
): boolean {
  if (input.bookingWindowConflict != null) return input.bookingWindowConflict;
  if (!input.bookingRows?.length || !input.pickupAt || !input.returnAt) return false;
  return hasBookingWindowConflict({
    vehicleId: input.vehicle.id,
    pickupAt: input.pickupAt,
    returnAt: input.returnAt,
    bookings: input.bookingRows,
    excludeBookingId: input.excludeBookingId,
  });
}

export function resolveBookingVehiclePreflight(
  vehicle: VehicleData,
  health: VehicleHealthResponse | null | undefined,
  hasTariff: boolean,
  catalogLoading: boolean,
  options: BookingVehiclePreflightContextInput | BookingVehiclePreflightOptions = {},
): BookingVehiclePreflight {
  const locale = options.locale ?? 'de';
  const t = tFor(locale);
  const bookingWindowConflict = resolveBookingWindowConflictForVehicle({
    vehicle,
    bookingRows: 'bookingRows' in options ? options.bookingRows : undefined,
    pickupAt: 'pickupAt' in options ? options.pickupAt : undefined,
    returnAt: 'returnAt' in options ? options.returnAt : undefined,
    excludeBookingId: 'excludeBookingId' in options ? options.excludeBookingId : undefined,
    bookingWindowConflict: options.bookingWindowConflict,
  });

  const eligibility = evaluateBookingVehicleEligibility({
    vehicle,
    health,
    hasTariff,
    catalogLoading,
    locale,
    bookingWindowConflict,
    businessBlockReason: options.businessBlockReason,
    rentalRuleBlockReason: options.rentalRuleBlockReason,
    healthLoading: options.healthLoading,
    healthRecordAbsent: options.healthRecordAbsent,
    allowHealthBypass: options.allowHealthBypass,
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
  const isRented = operationalStatus === VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED;
  const isReserved = operationalStatus === VEHICLE_OPERATIONAL_STATUS.RESERVED;

  let cautionReason: string | null = null;
  if (eligibility.eligible) {
    if (isRented) {
      cautionReason = t('booking.eligibility.caution.rented');
    } else if (isReserved) {
      cautionReason = t('booking.eligibility.caution.reserved');
    } else if (healthWarningOnly) {
      cautionReason =
        health?.blocking_reasons?.[0] ??
        (health?.overall_state === 'critical'
          ? t('booking.eligibility.caution.healthCritical')
          : t('booking.eligibility.caution.healthWarning'));
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
  options: BookingVehiclePreflightContextInput | BookingVehiclePreflightOptions = {},
): boolean {
  return !resolveBookingVehiclePreflight(vehicle, health, hasTariff, catalogLoading, options).isSelectable;
}

export function fleetStatusLabelDe(status: FleetStatus): string {
  return formatVehicleOperationalStatusLabel(status, 'de');
}
