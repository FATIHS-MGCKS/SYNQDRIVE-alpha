/**
 * Operator Today + Scan booking card presentation adapter (P2.2.41).
 * Booking machine values, callbacks, and dynamic data stay unchanged.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type { OperatorHandoverKind } from './operatorData';

export function resolveOperatorBookingCardLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function obc(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveOperatorBookingCardLocale(locale), key, vars).text;
}

export function operatorBookingCardDetailsLabel(locale: string): string {
  return obc(locale, 'common.details');
}

export function operatorBookingCardOverdueLabel(locale: string): string {
  return obc(locale, 'status.overdue');
}

export function operatorBookingCardDoneLabel(locale: string): string {
  return obc(locale, 'operator.bookings.card.done');
}

export function operatorBookingCardStartPickupLabel(locale: string): string {
  return obc(locale, 'vehicle.bookings.startPickup');
}

export function operatorBookingCardStartReturnLabel(locale: string): string {
  return obc(locale, 'vehicle.bookings.startReturn');
}

export function operatorBookingCardDueKindLabel(
  locale: string,
  kind: OperatorHandoverKind,
): string {
  return kind === 'PICKUP'
    ? obc(locale, 'operator.bookings.documents.group.pickup')
    : obc(locale, 'operator.bookings.documents.group.return');
}

export function operatorBookingCardScanTitle(locale: string, bookingIdSlice: string): string {
  return obc(locale, 'operator.bookings.card.scanTitle', { id: bookingIdSlice });
}

export function operatorBookingCardOpenVehicleLabel(locale: string): string {
  return obc(locale, 'bookings.vehicle');
}

export function operatorBookingCardHandoverPickupLabel(locale: string): string {
  return obc(locale, 'operator.bookings.documents.group.pickup');
}

export function operatorBookingCardHandoverReturnLabel(locale: string): string {
  return obc(locale, 'operator.bookings.documents.group.return');
}
