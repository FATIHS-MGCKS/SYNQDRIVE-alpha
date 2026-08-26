/**
 * P1.6 — Booking vehicle eligibility adapter.
 *
 * Separates operational availability (P0.2), business workflow, booking-window
 * conflicts, rental health, and tariff/rules. Does not use timestamp telemetry.
 */
import type { VehicleHealthResponse } from '../../lib/api';
import type { VehicleData } from '../data/vehicles';
import { de } from '../i18n/translations/de';
import { en } from '../i18n/translations/en';
import type { TranslationKey } from '../i18n/translations/en';
import { buildFleetVehicleUiProjection } from './fleet-vehicle-ui-projection';
import {
  OPERATIONAL_AVAILABILITY_STATE,
  isOperationalAvailabilityState,
  type OperationalAvailabilityState,
} from './operational-availability/types';
import {
  healthRentalUnverifiedMessage,
  isRentalBlockedUnverified,
} from './rental-health-availability';
import {
  VEHICLE_OPERATIONAL_STATUS,
  selectIsStatusReliable,
  selectOperationalStatus,
} from './vehicle-operational-state';

export type BookingOperationalAvailability = OperationalAvailabilityState | 'absent';

export type BookingEligibilityDenialDomain =
  | 'booking_conflict'
  | 'business_block'
  | 'operational_unavailable'
  | 'operational_needs_verification'
  | 'operational_unknown'
  | 'operational_absent'
  | 'rental_health'
  | 'rental_rules'
  | 'no_tariff'
  | 'status_unreliable'
  | null;

export interface BookingVehicleOperationalGateResult {
  availability: BookingOperationalAvailability;
  operationalEligible: boolean;
  primaryDenialDomain: BookingEligibilityDenialDomain;
  primaryDenialReason: string | null;
  recommendedAction: string | null;
}

export interface BookingVehicleEligibilityInput {
  vehicle: VehicleData;
  health?: VehicleHealthResponse | null;
  hasTariff?: boolean;
  catalogLoading?: boolean;
  locale?: 'de' | 'en';
  /** Requested interval overlaps an incompatible booking on this vehicle. */
  bookingWindowConflict?: boolean;
  /** Explicit business/manual block copy (maintenance policy, manual block, etc.). */
  businessBlockReason?: string | null;
  /** Station/category/permission restriction copy. */
  rentalRuleBlockReason?: string | null;
}

export interface BookingVehicleEligibilityResult extends BookingVehicleOperationalGateResult {
  eligible: boolean;
  businessEligible: boolean;
  bookingWindowEligible: boolean;
  healthEligible: boolean;
  tariffEligible: boolean;
  diagnosticReasons: string[];
}

function tFor(locale: 'en' | 'de'): (key: TranslationKey) => string {
  const dict = locale === 'de' ? de : en;
  return (key: TranslationKey) => dict[key] ?? key;
}

export function readBookingOperationalAvailability(
  vehicle: VehicleData,
): BookingOperationalAvailability {
  const state = vehicle.operationalAvailability?.state;
  return isOperationalAvailabilityState(state) ? state : 'absent';
}

export function isBookingOperationalGatePass(vehicle: VehicleData): boolean {
  return readBookingOperationalAvailability(vehicle) === OPERATIONAL_AVAILABILITY_STATE.AVAILABLE;
}

function operationalDenialPresentation(
  availability: BookingOperationalAvailability,
  vehicle: VehicleData,
  locale: 'de' | 'en',
): Pick<BookingVehicleOperationalGateResult, 'primaryDenialDomain' | 'primaryDenialReason'> {
  const t = tFor(locale);
  const ui = buildFleetVehicleUiProjection(vehicle, { locale });
  const presentation = ui.availability.presentation;
  const operatorReason =
    ui.operator.primaryReason.presentation?.label ??
    ui.attention.primaryReason.presentation?.label ??
    null;

  if (availability === OPERATIONAL_AVAILABILITY_STATE.NEEDS_VERIFICATION) {
    const label = presentation?.label ?? t('fleet.operationalAvailability.needsVerification');
    const tooltip = presentation?.tooltip ?? t('fleet.operationalAvailability.tooltip.needsVerification');
    return {
      primaryDenialDomain: 'operational_needs_verification',
      primaryDenialReason: operatorReason ?? `${label} — ${tooltip}`,
    };
  }

  if (availability === OPERATIONAL_AVAILABILITY_STATE.UNAVAILABLE) {
    const label = presentation?.label ?? t('fleet.operationalAvailability.unavailable');
    const tooltip = presentation?.tooltip ?? t('fleet.operationalAvailability.tooltip.unavailable');
    return {
      primaryDenialDomain: 'operational_unavailable',
      primaryDenialReason: operatorReason ?? `${label} — ${tooltip}`,
    };
  }

  if (availability === OPERATIONAL_AVAILABILITY_STATE.UNKNOWN) {
    const label = presentation?.label ?? t('fleet.operationalAvailability.unknown');
    const tooltip = presentation?.tooltip ?? t('fleet.operationalAvailability.tooltip.unknown');
    return {
      primaryDenialDomain: 'operational_unknown',
      primaryDenialReason: operatorReason ?? `${label} — ${tooltip}`,
    };
  }

  const label = presentation?.label ?? t('fleet.operationalAvailability.unknown');
  const tooltip = presentation?.tooltip ?? t('fleet.operationalAvailability.tooltip.unknown');
  return {
    primaryDenialDomain: 'operational_absent',
    primaryDenialReason: operatorReason ?? `${label} — ${tooltip}`,
  };
}

/** Canonical P0.2 operational gate for booking — no timestamp/onlineStatus derivation. */
export function evaluateBookingOperationalGate(
  vehicle: VehicleData,
  locale: 'de' | 'en' = 'de',
): BookingVehicleOperationalGateResult {
  const availability = readBookingOperationalAvailability(vehicle);
  const ui = buildFleetVehicleUiProjection(vehicle, { locale });
  const recommendedAction = ui.operator.recommendedAction.presentation?.label ?? null;

  if (availability === OPERATIONAL_AVAILABILITY_STATE.AVAILABLE) {
    return {
      availability,
      operationalEligible: true,
      primaryDenialDomain: null,
      primaryDenialReason: null,
      recommendedAction,
    };
  }

  const denial = operationalDenialPresentation(availability, vehicle, locale);
  return {
    availability,
    operationalEligible: false,
    recommendedAction,
    ...denial,
  };
}

export function evaluateBookingWindowConflict(input: {
  vehicleId: string;
  pickupAt: string;
  returnAt: string;
  bookings: Array<{
    vehicleId?: string | null;
    vehicle?: { id?: string | null } | null;
    status?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  }>;
  excludeBookingId?: string | null;
}): boolean {
  const pickupMs = Date.parse(input.pickupAt);
  const returnMs = Date.parse(input.returnAt);
  if (!Number.isFinite(pickupMs) || !Number.isFinite(returnMs) || returnMs <= pickupMs) {
    return false;
  }

  for (const booking of input.bookings) {
    const bookingId = (booking as { id?: string }).id;
    if (input.excludeBookingId && bookingId === input.excludeBookingId) continue;

    const bookingVehicleId = booking.vehicleId ?? booking.vehicle?.id ?? null;
    if (!bookingVehicleId || bookingVehicleId !== input.vehicleId) continue;

    const status = (booking.status ?? '').toUpperCase();
    if (status === 'CANCELLED' || status === 'CANCELED' || status === 'NO_SHOW') continue;

    const startMs = booking.startDate ? Date.parse(booking.startDate) : NaN;
    const endMs = booking.endDate ? Date.parse(booking.endDate) : NaN;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;

    if (startMs < returnMs && endMs > pickupMs) return true;
  }

  return false;
}

/**
 * Pure booking eligibility evaluation for picker/preflight/submit guards.
 * UI preflight is advisory; backend booking APIs remain authoritative for conflicts.
 */
export function evaluateBookingVehicleEligibility(
  input: BookingVehicleEligibilityInput,
): BookingVehicleEligibilityResult {
  const locale = input.locale ?? 'de';
  const t = tFor(locale);
  const operational = evaluateBookingOperationalGate(input.vehicle, locale);
  const diagnosticReasons: string[] = [];

  const health = input.health;
  const rentalBlocked = health?.rental_blocked === true;
  const rentalUnverified = health != null && isRentalBlockedUnverified(health);
  const healthEligible = !rentalBlocked && !rentalUnverified;

  const catalogLoading = input.catalogLoading ?? false;
  const hasTariff = input.hasTariff ?? true;
  const tariffEligible = hasTariff || catalogLoading;

  const operationalStatus = selectOperationalStatus(input.vehicle);
  const statusUnreliable = !selectIsStatusReliable(input.vehicle);
  const isBlockedBusiness = operationalStatus === VEHICLE_OPERATIONAL_STATUS.BLOCKED;
  const isUnknownBusiness = operationalStatus === VEHICLE_OPERATIONAL_STATUS.UNKNOWN;

  const bookingWindowEligible = !input.bookingWindowConflict;
  const businessBlockReason = input.businessBlockReason ?? null;
  const rentalRuleBlockReason = input.rentalRuleBlockReason ?? null;

  const businessEligible =
    !businessBlockReason && !isBlockedBusiness && !isUnknownBusiness && !statusUnreliable;

  if (input.bookingWindowConflict) {
    diagnosticReasons.push('booking_window_conflict');
  }
  if (businessBlockReason) diagnosticReasons.push('business_block');
  if (isBlockedBusiness) diagnosticReasons.push('business_status_blocked');
  if (isUnknownBusiness || statusUnreliable) diagnosticReasons.push('status_unreliable');
  if (!operational.operationalEligible) diagnosticReasons.push(`operational:${operational.availability}`);
  if (rentalBlocked) diagnosticReasons.push('rental_health_blocked');
  if (rentalUnverified) diagnosticReasons.push('rental_health_unverified');
  if (!tariffEligible) diagnosticReasons.push('no_tariff');
  if (rentalRuleBlockReason) diagnosticReasons.push('rental_rule');

  let primaryDenialDomain: BookingEligibilityDenialDomain = null;
  let primaryDenialReason: string | null = null;

  if (input.bookingWindowConflict) {
    primaryDenialDomain = 'booking_conflict';
    primaryDenialReason = t('booking.eligibility.conflict');
  } else if (businessBlockReason) {
    primaryDenialDomain = 'business_block';
    primaryDenialReason = businessBlockReason;
  } else if (isBlockedBusiness) {
    primaryDenialDomain = 'business_block';
    primaryDenialReason = t('booking.eligibility.businessBlocked');
  } else if (rentalBlocked) {
    primaryDenialDomain = 'rental_health';
    primaryDenialReason =
      health?.blocking_reasons?.filter(Boolean).join(' · ') ||
      (locale === 'de' ? 'Nicht vermietbar' : 'Not rentable');
  } else if (rentalUnverified) {
    primaryDenialDomain = 'rental_health';
    primaryDenialReason = healthRentalUnverifiedMessage(locale);
  } else if (!operational.operationalEligible) {
    primaryDenialDomain = operational.primaryDenialDomain;
    primaryDenialReason = operational.primaryDenialReason;
  } else if (!tariffEligible) {
    primaryDenialDomain = 'no_tariff';
    primaryDenialReason = t('booking.eligibility.noTariff');
  } else if (isUnknownBusiness || statusUnreliable) {
    primaryDenialDomain = 'status_unreliable';
    primaryDenialReason = t('booking.eligibility.statusUnavailable');
  } else if (rentalRuleBlockReason) {
    primaryDenialDomain = 'rental_rules';
    primaryDenialReason = rentalRuleBlockReason;
  }

  const eligible =
    bookingWindowEligible &&
    businessEligible &&
    healthEligible &&
    operational.operationalEligible &&
    tariffEligible &&
    !rentalRuleBlockReason;

  return {
    ...operational,
    eligible,
    businessEligible,
    bookingWindowEligible,
    healthEligible,
    tariffEligible,
    primaryDenialDomain,
    primaryDenialReason,
    diagnosticReasons,
  };
}
