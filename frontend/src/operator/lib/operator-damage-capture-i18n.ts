/**
 * Operator Damage Capture presentation helpers.
 * Payload enums, IDs, coordinates, and API contracts stay unchanged.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type {
  DamageRentalImpact,
  DamageSeverity,
  DamageSource,
} from '../../rental/lib/damage.types';
import { DESCRIPTION_MAX_LENGTH } from '../../rental/lib/damage.types';
import type {
  OperatorDamageCaptureStep,
  OperatorDamageValidationCode,
} from '../damages/operatorDamagePayload';

export function resolveOperatorDamageCaptureLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function odc(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveOperatorDamageCaptureLocale(locale), key, vars).text;
}

export function operatorDamageCaptureStepKey(
  step: OperatorDamageCaptureStep,
): TranslationKey {
  return `operator.damageCapture.steps.${step}` as TranslationKey;
}

export function operatorDamageCaptureStepLabel(
  locale: string,
  step: OperatorDamageCaptureStep,
): string {
  return odc(locale, operatorDamageCaptureStepKey(step));
}

export function operatorDamageCaptureDamageTypeLabel(locale: string, value: string): string {
  const key = `operator.damageCapture.damageType.${value}` as TranslationKey;
  const translated = odc(locale, key);
  if (translated !== key) return translated;
  return value;
}

export function operatorDamageCaptureSeverityLabel(
  locale: string,
  value: DamageSeverity | string,
): string {
  const key = `operator.damageCapture.severity.${value}` as TranslationKey;
  const translated = odc(locale, key);
  if (translated !== key) return translated;
  return value;
}

export function operatorDamageCaptureRentalImpactLabel(
  locale: string,
  value: DamageRentalImpact | string,
): string {
  const key = `operator.damageCapture.rentalImpact.${value}` as TranslationKey;
  const translated = odc(locale, key);
  if (translated !== key) return translated;
  return value;
}

export function operatorDamageCaptureLocationChipLabel(locale: string, chipId: string): string {
  const key = `operator.damageCapture.location.${chipId}` as TranslationKey;
  const translated = odc(locale, key);
  if (translated !== key) return translated;
  return chipId;
}

export function operatorDamageCaptureSourceLabel(locale: string, source: DamageSource | string): string {
  const key = `operator.damageCapture.source.${source}` as TranslationKey;
  const translated = odc(locale, key);
  if (translated !== key) return translated;
  return source;
}

export function operatorDamageCaptureValidationMessage(
  locale: string,
  code: OperatorDamageValidationCode,
): string {
  switch (code) {
    case 'PHOTOS_REQUIRED':
      return odc(locale, 'operator.damageCapture.validation.photosRequired');
    case 'DAMAGE_TYPE_REQUIRED':
      return odc(locale, 'operator.damageCapture.validation.damageTypeRequired');
    case 'SEVERITY_REQUIRED':
      return odc(locale, 'operator.damageCapture.validation.severityRequired');
    case 'DESCRIPTION_TOO_LONG':
      return odc(locale, 'operator.damageCapture.validation.descriptionMax', {
        max: DESCRIPTION_MAX_LENGTH,
      });
    default:
      return code;
  }
}
