/**
 * Operator Booking Cancel & No-Show Sheets presentation adapter (P2.2.37).
 * Booking machine values, validation predicates, and payloads stay unchanged.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';

const CANCEL_MATRIX_REASON_MAP: Record<string, TranslationKey> = {
  'Stornierung in diesem Status nicht möglich':
    'operator.bookings.cancelNoShow.gate.cancelNotInStatus',
};

const NO_SHOW_GATE_REASON_MAP: Record<string, TranslationKey> = {
  'No-Show nur bei bestätigten Buchungen möglich':
    'operator.bookings.cancelNoShow.gate.noShowConfirmedOnly',
  'Pickup bereits erfasst': 'operator.bookings.cancelNoShow.gate.pickupAlreadyRecorded',
  'Geplanter Abholzeitpunkt liegt noch in der Zukunft':
    'operator.bookings.cancelNoShow.gate.pickupInFuture',
  'Laden…': 'operator.bookings.cancelNoShow.loading',
};

export function resolveOperatorBookingCancelNoShowLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function obcn(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveOperatorBookingCancelNoShowLocale(locale), key, vars).text;
}

export function operatorBookingCancelSheetTitle(locale: string): string {
  return obcn(locale, 'operator.bookings.cancelNoShow.cancel.title');
}

export function operatorBookingNoShowSheetTitle(locale: string): string {
  return obcn(locale, 'operator.bookings.cancelNoShow.noShow.title');
}

export function operatorBookingCancelMatrixReasonLabel(
  locale: string,
  reason: string | undefined,
): string {
  if (!reason) {
    return obcn(locale, 'operator.bookings.cancelNoShow.cancel.deniedDefaultReason');
  }
  const key = CANCEL_MATRIX_REASON_MAP[reason];
  return key ? obcn(locale, key) : reason;
}

export function operatorBookingNoShowGateReasonLabel(
  locale: string,
  reason: string | undefined,
): string {
  if (!reason) return '';
  const key = NO_SHOW_GATE_REASON_MAP[reason];
  return key ? obcn(locale, key) : reason;
}

export function operatorBookingCancelSuccessToast(locale: string): string {
  return obcn(locale, 'operator.bookings.cancelNoShow.toast.cancelled');
}

export function operatorBookingNoShowSuccessToast(locale: string): string {
  return obcn(locale, 'operator.bookings.cancelNoShow.toast.noShowMarked');
}
