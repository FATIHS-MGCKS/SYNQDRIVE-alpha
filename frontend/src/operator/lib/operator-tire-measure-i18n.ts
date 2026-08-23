/**
 * Operator Tire Measure presentation helpers.
 * Tire position IDs, tread parsing, thresholds, and API payloads stay unchanged.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type {
  OperatorTireMeasureSource,
  OperatorTireMeasureStep,
  OperatorTireMeasureValidationCode,
  OperatorTirePlausibilityCode,
  OperatorTirePlausibilityWarning,
  OperatorTireTreadForm,
} from '../tire-measure/operatorTireMeasure.types';

export function resolveOperatorTireMeasureLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function otm(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveOperatorTireMeasureLocale(locale), key, vars).text;
}

export const OPERATOR_TIRE_POSITION_KEYS = ['fl', 'fr', 'rl', 'rr'] as const;

export type OperatorTirePositionKey = (typeof OPERATOR_TIRE_POSITION_KEYS)[number];

export function operatorTireMeasureStepLabel(
  locale: string,
  step: OperatorTireMeasureStep,
): string {
  return otm(locale, `operator.tireMeasure.steps.${step}` as TranslationKey);
}

export function operatorTireMeasurePositionShort(
  locale: string,
  position: OperatorTirePositionKey,
): string {
  return otm(locale, `operator.tireMeasure.positions.${position}.short` as TranslationKey);
}

export function operatorTireMeasurePositionLong(
  locale: string,
  position: OperatorTirePositionKey,
): string {
  return otm(locale, `operator.tireMeasure.positions.${position}.long` as TranslationKey);
}

export function operatorTireMeasureSourceLabel(
  locale: string,
  source: OperatorTireMeasureSource,
): string {
  return otm(locale, `operator.tireMeasure.sources.${source}` as TranslationKey);
}

export function operatorTireMeasureSeasonLabel(locale: string, season: string | null): string {
  if (!season) {
    return otm(locale, 'operator.tireMeasure.fallback.unknown');
  }
  const key = `operator.tireMeasure.seasons.${season}` as TranslationKey;
  const translated = otm(locale, key);
  if (translated !== key) return translated;
  return season;
}

export function operatorTireMeasureValidationMessage(
  locale: string,
  code: OperatorTireMeasureValidationCode,
): string {
  switch (code) {
    case 'TREAD_REQUIRED':
      return otm(locale, 'operator.tireMeasure.validation.treadRequired');
    case 'MEASURED_AT_INVALID':
      return otm(locale, 'operator.tireMeasure.validation.measuredAtInvalid');
    case 'ODOMETER_INVALID':
      return otm(locale, 'operator.tireMeasure.validation.odometerInvalid');
    default:
      return code;
  }
}

export function operatorTireMeasurePlausibilityMessage(
  locale: string,
  warning: OperatorTirePlausibilityWarning,
): string {
  const position =
    typeof warning.params.position === 'string'
      ? operatorTireMeasurePositionShort(locale, warning.params.position as OperatorTirePositionKey)
      : String(warning.params.position ?? '');

  switch (warning.code) {
    case 'RANGE':
      return otm(locale, 'operator.tireMeasure.plausibility.range', {
        position,
        min: warning.params.min as number,
        max: warning.params.max as number,
      });
    case 'LEGAL_MIN':
      return otm(locale, 'operator.tireMeasure.plausibility.legalMin', {
        position,
        mm: warning.params.mm as number,
      });
    case 'LOW':
      return otm(locale, 'operator.tireMeasure.plausibility.low', {
        position,
        mm: warning.params.mm as number,
      });
    case 'HIGH':
      return otm(locale, 'operator.tireMeasure.plausibility.high', {
        position,
        mm: warning.params.mm as number,
      });
    case 'FRONT_AXLE_DIFF':
      return otm(locale, 'operator.tireMeasure.plausibility.frontAxleDiff', {
        diff: warning.params.diff as number,
      });
    case 'REAR_AXLE_DIFF':
      return otm(locale, 'operator.tireMeasure.plausibility.rearAxleDiff', {
        diff: warning.params.diff as number,
      });
    default:
      return warning.code;
  }
}

export function formatOperatorTireOdometer(
  locale: string,
  km: number | null | undefined,
): string {
  if (km == null || !Number.isFinite(km)) return '—';
  const resolved = resolveOperatorTireMeasureLocale(locale);
  return `${Math.round(km).toLocaleString(resolved)} km`;
}

export function operatorTireMeasureHandoverNotePrefix(
  locale: string,
  bookingId: string,
): string {
  return otm(locale, 'operator.tireMeasure.handover.notePrefix', {
    id: bookingId.slice(0, 8),
  });
}

export function operatorTireMeasureSetupSuffix(
  locale: string,
  kind: 'stored' | 'mounted',
): string {
  return otm(locale, `operator.tireMeasure.setup.${kind}` as TranslationKey);
}

export const OPERATOR_TIRE_MEASURE_SOURCE_OPTIONS: ReadonlyArray<{
  value: OperatorTireMeasureSource;
}> = [{ value: 'manual' }, { value: 'workshop' }, { value: 'ai_confirmed' }];

export const OPERATOR_TIRE_MEASURE_WHEELS: ReadonlyArray<{
  key: keyof OperatorTireTreadForm;
  position: OperatorTirePositionKey;
}> = [
  { key: 'fl', position: 'fl' },
  { key: 'fr', position: 'fr' },
  { key: 'rl', position: 'rl' },
  { key: 'rr', position: 'rr' },
];
