import { describe, expect, it } from 'vitest';
import { cs } from '../../i18n/translations/cs';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import { es } from '../../i18n/translations/es';
import { fr } from '../../i18n/translations/fr';
import { it as itLocale } from '../../i18n/translations/it';
import { nl } from '../../i18n/translations/nl';
import { pl } from '../../i18n/translations/pl';
import type { TranslationKey } from '../../i18n/translations/en';

const REQUIRED_KEYS: TranslationKey[] = [
  'fleet.healthEvaluation.condition.good',
  'fleet.healthEvaluation.condition.warning',
  'fleet.healthEvaluation.condition.critical',
  'fleet.healthEvaluation.condition.unknown',
  'fleet.healthEvaluation.partiallyEvaluable',
  'fleet.healthEvaluation.notEvaluable',
  'fleet.healthEvaluation.unknown',
  'fleet.healthEvaluation.tooltip.partiallyEvaluable',
  'fleet.healthEvaluation.tooltip.notEvaluable',
  'fleet.healthEvaluation.tooltip.unknown',
];

const LOCALES = [
  ['de', de],
  ['en', en],
  ['fr', fr],
  ['nl', nl],
  ['es', es],
  ['it', itLocale],
  ['pl', pl],
  ['cs', cs],
] as const;

describe('fleet health evaluation i18n (P0.4)', () => {
  it.each(LOCALES)('%s has all required keys', (_locale, dict) => {
    for (const key of REQUIRED_KEYS) {
      expect(dict[key], key).toBeTruthy();
    }
  });

  it('DE and EN primary labels match spec', () => {
    expect(de['fleet.healthEvaluation.condition.good']).toBe('Gut');
    expect(de['fleet.healthEvaluation.notEvaluable']).toBe('Nicht bewertbar');
    expect(en['fleet.healthEvaluation.condition.good']).toBe('Good');
    expect(en['fleet.healthEvaluation.notEvaluable']).toBe('Not evaluable');
  });
});
