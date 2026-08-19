import type {
  RentalAdditionalDriverPolicy,
  RentalForeignTravelPolicy,
  RentalVehicleCategoryType,
  RentalYoungDriverPolicy,
} from './rental-rules.types';
import type { TranslationKey } from '../../../../i18n/translations/en';
import { st } from '../../tasks-settings/settings-i18n';

function policyOptions<T extends string>(
  locale: string,
  entries: Array<{ value: T; key: TranslationKey }>,
): { value: T; label: string }[] {
  return entries.map(({ value, key }) => ({ value, label: st(locale, key) }));
}

export function getForeignTravelOptions(locale: string): { value: RentalForeignTravelPolicy; label: string }[] {
  return policyOptions(locale, [
    { value: 'ALLOWED', key: 'rentalRules.policy.allowed' },
    { value: 'APPROVAL_REQUIRED', key: 'rentalRules.policy.approvalRequired' },
    { value: 'NOT_ALLOWED', key: 'rentalRules.policy.notAllowed' },
  ]);
}

export function getAdditionalDriverOptions(
  locale: string,
): { value: RentalAdditionalDriverPolicy; label: string }[] {
  return policyOptions(locale, [
    { value: 'ALLOWED', key: 'rentalRules.policy.allowed' },
    { value: 'APPROVAL_REQUIRED', key: 'rentalRules.policy.approvalRequired' },
    { value: 'NOT_ALLOWED', key: 'rentalRules.policy.notAllowed' },
  ]);
}

export function getYoungDriverOptions(locale: string): { value: RentalYoungDriverPolicy; label: string }[] {
  return policyOptions(locale, [
    { value: 'ALLOWED', key: 'rentalRules.policy.allowed' },
    { value: 'FEE_REQUIRED', key: 'rentalRules.policy.feeRequired' },
    { value: 'NOT_ALLOWED', key: 'rentalRules.policy.notAllowed' },
  ]);
}

export function getCategoryTypeOptions(
  locale: string,
): { value: RentalVehicleCategoryType; label: string }[] {
  return policyOptions(locale, [
    { value: 'ECONOMY', key: 'rentalRules.categoryType.ECONOMY' },
    { value: 'COMPACT', key: 'rentalRules.categoryType.COMPACT' },
    { value: 'TRANSPORTER', key: 'rentalRules.categoryType.TRANSPORTER' },
    { value: 'PREMIUM', key: 'rentalRules.categoryType.PREMIUM' },
    { value: 'PERFORMANCE', key: 'rentalRules.categoryType.PERFORMANCE' },
    { value: 'LUXURY', key: 'rentalRules.categoryType.LUXURY' },
    { value: 'EV_PERFORMANCE', key: 'rentalRules.categoryType.EV_PERFORMANCE' },
    { value: 'CUSTOM', key: 'rentalRules.categoryType.CUSTOM' },
  ]);
}

export const CATEGORY_COLOR_PRESETS = [
  '#3D5A73',
  '#4F6D8F',
  '#5B8A72',
  '#8B6B4A',
  '#7C5C8A',
  '#4A7C8B',
  '#8A4A4A',
];
