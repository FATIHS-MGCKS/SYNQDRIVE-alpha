/**
 * Operator Booking Form Sheet presentation adapter (P2.2.36).
 * Booking machine values, validation predicates, and payloads stay unchanged.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';

export type OperatorBookingFormMode = 'create' | 'edit';

export type OperatorBookingFormStatus = 'PENDING' | 'CONFIRMED';

const STATUS_LABEL_KEYS: Record<OperatorBookingFormStatus, TranslationKey> = {
  PENDING: 'bookings.planner.pending',
  CONFIRMED: 'bookings.confirmed',
};

export function resolveOperatorBookingFormLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function obf(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveOperatorBookingFormLocale(locale), key, vars).text;
}

export function operatorBookingFormTitle(locale: string, mode: OperatorBookingFormMode): string {
  return mode === 'edit'
    ? obf(locale, 'bookings.edit.title')
    : obf(locale, 'operator.bookings.form.createTitle');
}

export function operatorBookingFormSubmitLabel(
  locale: string,
  mode: OperatorBookingFormMode,
  mutating: boolean,
): string {
  if (mutating) return obf(locale, 'operator.bookings.form.saving');
  return mode === 'edit'
    ? obf(locale, 'bookings.edit.saveChanges')
    : obf(locale, 'operator.bookings.form.createSubmit');
}

export function operatorBookingFormStatusLabel(
  locale: string,
  status: OperatorBookingFormStatus,
): string {
  return obf(locale, STATUS_LABEL_KEYS[status]);
}

export function operatorBookingFormPriceQuoteTotal(
  locale: string,
  formattedAmount: string,
): string {
  return obf(locale, 'operator.bookings.form.priceQuoteTotal', { amount: formattedAmount });
}

export type OperatorBookingFormErrorKey = Extract<
  TranslationKey,
  `operator.bookings.form.error.${string}`
>;

export function operatorBookingFormErrorMessage(
  locale: string,
  key: OperatorBookingFormErrorKey,
): string {
  return obf(locale, key);
}
