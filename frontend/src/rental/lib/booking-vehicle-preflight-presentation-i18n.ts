/**
 * Canonical booking vehicle preflight presentation adapter (P2.2.17).
 * Machine preflight codes and eligibility stay in booking-vehicle-preflight.ts.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import type { TranslationKey } from '../../i18n/translations/en';
import { bt } from '../components/bookings-customers/bookings-i18n';

export function resolveBookingVehiclePreflightLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

function bvp(locale: string, key: TranslationKey): string {
  return bt(resolveBookingVehiclePreflightLocale(locale), key);
}

export function bookingVehicleOfflineLabel(locale: string): string {
  return bvp(locale, 'bookings.wizard.vehiclePicker.preflight.vehicleOffline');
}

export function bookingVehicleNotRentableFallbackLabel(locale: string): string {
  return bvp(locale, 'health.rentalBlocked');
}

export function bookingVehicleRentalUnverifiedLabel(locale: string): string {
  return bvp(locale, 'fleetCondition.rentalClearanceNotVerified');
}

export function bookingVehicleNoActiveTariffLabel(locale: string): string {
  return bvp(locale, 'bookings.wizard.vehiclePicker.preflight.noActiveTariff');
}

export function bookingVehicleStatusUnavailableLabel(locale: string): string {
  return bvp(locale, 'bookings.wizard.vehiclePicker.preflight.statusUnavailable');
}

export function bookingVehicleMaintenanceCautionLabel(locale: string): string {
  return bvp(locale, 'bookings.wizard.vehiclePicker.preflight.maintenanceCaution');
}

export function bookingVehicleCurrentlyRentedCautionLabel(locale: string): string {
  return bvp(locale, 'bookings.wizard.vehiclePicker.preflight.currentlyRented');
}

export function bookingVehicleReservedCautionLabel(locale: string): string {
  return bvp(locale, 'bookings.wizard.vehiclePicker.preflight.reservedCaution');
}

export function bookingVehicleHealthCriticalCautionLabel(locale: string): string {
  return bvp(locale, 'bookings.wizard.vehiclePicker.preflight.healthCritical');
}

export function bookingVehicleHealthWarningCautionLabel(locale: string): string {
  return bvp(locale, 'bookings.wizard.vehiclePicker.preflight.healthWarning');
}
