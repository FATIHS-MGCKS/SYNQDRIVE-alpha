/**
 * Rental Handover presentation helpers.
 * Non-React utilities and shared gate/damage label resolution.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../../i18n/locales';
import { translateKey } from '../../../i18n/LanguageContext';
import type { TranslationKey } from '../../../i18n/translations/en';
import type { BookingHandoverGate } from '../../lib/bookingHandoverGates';

/** Persisted/backend audit fallback — never translate or localize this value. */
export const HANDOVER_REPORTED_BY_FALLBACK = 'Handover' as const;

export function resolveHandoverLocale(locale: string | null | undefined): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function ho(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveHandoverLocale(locale), key, vars).text;
}

export function resolveHandoverGateReason(
  locale: string,
  gate: BookingHandoverGate,
): string | undefined {
  if (gate.allowed || !gate.reasonKey) return undefined;
  return ho(locale, gate.reasonKey, gate.reasonParams);
}

export function handoverFormattingLocale(locale: string): string {
  return resolveHandoverLocale(locale) === 'de' ? 'de-DE' : 'en-US';
}

const DAMAGE_TYPE_KEYS: Record<string, TranslationKey> = {
  SCRATCH: 'handover.damageType.SCRATCH',
  DENT: 'handover.damageType.DENT',
  CHIP: 'handover.damageType.CHIP',
  CRACK: 'handover.damageType.CRACK',
  TEAR: 'handover.damageType.TEAR',
  STAIN: 'handover.damageType.STAIN',
  MECHANICAL: 'handover.damageType.MECHANICAL',
  OTHER: 'handover.damageType.OTHER',
};

const DAMAGE_SEVERITY_KEYS: Record<string, TranslationKey> = {
  MINOR: 'handover.damageSeverity.MINOR',
  MODERATE: 'handover.damageSeverity.MODERATE',
  MAJOR: 'handover.damageSeverity.MAJOR',
  CRITICAL: 'handover.damageSeverity.CRITICAL',
};

export function labelHandoverDamageType(locale: string, damageType: string): string {
  const key = DAMAGE_TYPE_KEYS[damageType] ?? 'handover.damageType.OTHER';
  return ho(locale, key);
}

export function labelHandoverDamageSeverity(locale: string, severity: string): string {
  const key = DAMAGE_SEVERITY_KEYS[severity] ?? 'handover.damageSeverity.MINOR';
  return ho(locale, key);
}

export const HANDOVER_DAMAGE_TYPE_OPTIONS = [
  'SCRATCH',
  'DENT',
  'CHIP',
  'CRACK',
  'TEAR',
  'STAIN',
  'MECHANICAL',
  'OTHER',
] as const;

export const HANDOVER_DAMAGE_SEVERITY_OPTIONS = ['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL'] as const;

export { DAMAGE_TYPE_KEYS, DAMAGE_SEVERITY_KEYS };
