import { describe, expect, it } from 'vitest';
import { en } from '../../../i18n/translations/en';
import type { TranslationKey } from '../../../i18n/translations/en';
import { RentalRulesMutationError } from './rental-rules-concurrency.errors';
import {
  buildRentalRulesConflictModel,
  resolveExpectedVersion,
  withExpectedVersion,
} from './rental-rules-concurrency.utils';
import { RENTAL_RULES_INITIAL_EXPECTED_VERSION } from './rental-rules-concurrency.constants';

const t = (key: TranslationKey, vars?: Record<string, string | number>) => {
  let value = en[key] ?? key;
  if (vars) {
    for (const [name, replacement] of Object.entries(vars)) {
      value = value.replace(`{${name}}`, String(replacement));
    }
  }
  return value;
};

describe('rental-rules-concurrency.utils', () => {
  it('uses version 0 when no row exists yet', () => {
    expect(resolveExpectedVersion(undefined)).toBe(RENTAL_RULES_INITIAL_EXPECTED_VERSION);
    expect(withExpectedVersion({ minimumAgeYears: 21 }, null)).toEqual({
      minimumAgeYears: 21,
      expectedVersion: 0,
    });
  });

  it('builds conflict model with local and server summaries', () => {
    const err = new RentalRulesMutationError(409, {
      code: 'RENTAL_RULES_VERSION_CONFLICT',
      message: 'conflict',
      entityType: 'category',
      expectedVersion: 2,
      currentVersion: 3,
      current: { name: 'Premium', minimumAgeYears: 25 },
    });
    const model = buildRentalRulesConflictModel(t, err, 'Minimum age: 21 yr');
    expect(model.title).toContain('changed');
    expect(model.yourChangesSummary).toContain('21');
    expect(model.serverChangesSummary).toContain('Premium');
    expect(model.reloadLabel).toBeTruthy();
    expect(model.editAgainLabel).toBeTruthy();
  });
});
