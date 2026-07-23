import {
  normalizeRuleDtoInput,
  pickRulePatch,
  prismaRuleColumns,
  toPrismaRuleColumns,
} from './rental-rules.mapper';

describe('rental-rules.mapper patch semantics', () => {
  it('pickRulePatch omits undefined keys and preserves null clears', () => {
    const patch = pickRulePatch({
      minimumAgeYears: null,
      creditCardRequired: false,
      foreignTravelPolicy: undefined,
    });

    expect(patch).toEqual({
      minimumAgeYears: null,
      creditCardRequired: false,
    });
    expect('foreignTravelPolicy' in patch).toBe(false);
  });

  it('normalizes empty strings to null for text fields', () => {
    const normalized = normalizeRuleDtoInput({
      insuranceRequirement: '   ',
      notes: '',
      depositCurrency: ' ',
    });

    expect(normalized.insuranceRequirement).toBeNull();
    expect(normalized.notes).toBeNull();
    expect(normalized.depositCurrency).toBeNull();
  });

  it('maps license years alias to months', () => {
    const patch = pickRulePatch({ minimumLicenseHoldingYears: 2 });
    expect(patch.minimumLicenseHoldingMonths).toBe(24);
  });

  it('toPrismaRuleColumns allows null depositCurrency for category layer', () => {
    const cols = toPrismaRuleColumns(
      { depositCurrency: null, minimumAgeYears: 21 },
      { layer: 'category' },
    );
    expect(cols).toEqual({ depositCurrency: null, minimumAgeYears: 21 });
  });

  it('toPrismaRuleColumns ignores null depositCurrency for organization layer', () => {
    const cols = toPrismaRuleColumns(
      { depositCurrency: null, minimumAgeYears: 21 },
      { layer: 'organization' },
    );
    expect(cols).toEqual({ minimumAgeYears: 21 });
  });

  it('prismaRuleColumns strips isActive from rule columns', () => {
    const cols = prismaRuleColumns(
      { minimumAgeYears: 21, isActive: true },
      { layer: 'category' },
    );
    expect(cols).toEqual({ minimumAgeYears: 21 });
  });
});
