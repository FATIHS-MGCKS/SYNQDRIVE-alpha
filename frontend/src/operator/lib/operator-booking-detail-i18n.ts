/**
 * Operator Booking Detail Sheet presentation adapter (P2.2.40).
 * Booking machine values, callbacks, and dynamic data stay unchanged.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type { OperatorHandoverKind } from '../lib/operatorData';
import {
  operatorBookingCancelMatrixReasonLabel,
  operatorBookingNoShowGateReasonLabel,
} from './operator-booking-cancel-noshow-i18n';

const EDIT_GATE_REASON_MAP: Record<string, TranslationKey> = {
  'Stornierte oder No-Show-Buchungen sind nicht bearbeitbar':
    'operator.bookings.detail.gate.editCancelledOrNoShow',
  'Abgeschlossene Buchungen sind schreibgeschützt':
    'operator.bookings.detail.gate.editCompleted',
  'Während aktiver Vermietung nur begrenzte Änderungen — Notizen separat':
    'operator.bookings.detail.gate.editActive',
};

export function resolveOperatorBookingDetailLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function obds(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveOperatorBookingDetailLocale(locale), key, vars).text;
}

export function operatorBookingDetailEyebrow(locale: string): string {
  return obds(locale, 'operator.bookings.detail.eyebrow');
}

export function operatorBookingDetailCloseAria(locale: string): string {
  return obds(locale, 'common.close');
}

export function operatorBookingDetailKindLabel(
  locale: string,
  kind: OperatorHandoverKind | 'BOOKING',
): string {
  if (kind === 'BOOKING') return obds(locale, 'operator.bookings.detail.kind.booking');
  if (kind === 'PICKUP') return obds(locale, 'operator.bookings.documents.group.pickup');
  return obds(locale, 'operator.bookings.documents.group.return');
}

export function operatorBookingDetailCustomerLabel(locale: string): string {
  return obds(locale, 'bookings.customer');
}

export function operatorBookingDetailStationLabel(locale: string): string {
  return obds(locale, 'operator.bookings.detail.station');
}

export function operatorBookingDetailTimeLabel(locale: string): string {
  return obds(locale, 'operator.bookings.detail.time');
}

export function operatorBookingDetailEmptyValue(locale: string): string {
  return obds(locale, 'operator.bookings.detail.emptyValue');
}

export function operatorBookingDetailLoadErrorFallback(locale: string): string {
  return obds(locale, 'operator.bookings.form.error.detailsUnavailable');
}

export function operatorBookingDetailVehicleBlockedTitle(locale: string): string {
  return obds(locale, 'operator.bookings.detail.vehicleBlocked');
}

export function operatorBookingDetailDocumentVerificationTitle(locale: string): string {
  return obds(locale, 'operator.bookings.detail.documentVerification');
}

export function operatorBookingDetailPickupVerificationAction(locale: string): string {
  return obds(locale, 'operator.bookings.detail.pickupVerificationAction');
}

export function operatorBookingDetailManageSectionTitle(locale: string): string {
  return obds(locale, 'operator.bookings.detail.manageSection');
}

export function operatorBookingDetailEditLabel(locale: string): string {
  return obds(locale, 'common.edit');
}

export function operatorBookingDetailCancelLabel(locale: string): string {
  return obds(locale, 'operator.bookings.cancelNoShow.cancel.submit');
}

export function operatorBookingDetailNoShowLabel(locale: string): string {
  return obds(locale, 'operator.bookings.cancelNoShow.noShow.submit');
}

export function operatorBookingDetailStartPickupLabel(locale: string): string {
  return obds(locale, 'vehicle.bookings.startPickup');
}

export function operatorBookingDetailStartReturnLabel(locale: string): string {
  return obds(locale, 'vehicle.bookings.startReturn');
}

export function operatorBookingDetailEditGateReasonLabel(
  locale: string,
  reason: string | undefined,
): string {
  if (!reason) return '';
  const key = EDIT_GATE_REASON_MAP[reason];
  return key ? obds(locale, key) : reason;
}

export function operatorBookingDetailCancelGateReasonLabel(
  locale: string,
  reason: string | undefined,
): string {
  return operatorBookingCancelMatrixReasonLabel(locale, reason);
}

export function operatorBookingDetailNoShowGateReasonLabel(
  locale: string,
  reason: string | undefined,
): string {
  return operatorBookingNoShowGateReasonLabel(locale, reason);
}
