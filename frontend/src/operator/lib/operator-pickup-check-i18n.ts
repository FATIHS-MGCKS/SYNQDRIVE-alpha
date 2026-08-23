/**
 * Operator Pickup Verification presentation helpers.
 * ManualPickupCheckDto field names and boolean semantics stay unchanged.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type { OperatorPickupCheckFieldKey } from '../verification/operatorPickupCheckPayload';

export function resolveOperatorPickupCheckLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function opc(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveOperatorPickupCheckLocale(locale), key, vars).text;
}

export const OPERATOR_PICKUP_CHECK_FIELDS: ReadonlyArray<{
  field: OperatorPickupCheckFieldKey;
  optional?: boolean;
}> = [
  { field: 'idDocumentSeen' },
  { field: 'idNameMatchesBooking' },
  { field: 'idDateOfBirthChecked' },
  { field: 'minimumAgePassed' },
  { field: 'drivingLicenseSeen' },
  { field: 'licenseNameMatchesBooking' },
  { field: 'licenseClassValid' },
  { field: 'licenseNotExpired' },
  { field: 'minimumLicenseDurationPassed', optional: true },
];

export function operatorPickupCheckFieldLabel(
  locale: string,
  field: OperatorPickupCheckFieldKey,
): string {
  const key = `operator.pickupCheck.checklist.${field}` as TranslationKey;
  return opc(locale, key);
}
