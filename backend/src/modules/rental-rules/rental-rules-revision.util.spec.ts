import {
  buildNormalizedRentalRulesDocument,
  buildRentalRuleRevisionSnapshot,
  canonicalizeRuleFields,
  computeRentalRulesHash,
  stableStringifyNormalizedRules,
} from './rental-rules-revision.util';

describe('rental-rules-revision.util', () => {
  const orgRow = {
    organizationId: 'org-1',
    isActive: true,
    minimumAgeYears: 21,
    minimumLicenseHoldingMonths: 12,
    depositAmountCents: 10000,
    depositCurrency: 'EUR',
    creditCardRequired: true,
    foreignTravelPolicy: 'ALLOWED',
    additionalDriverPolicy: 'ALLOWED',
    youngDriverPolicy: 'FEE_REQUIRED',
    insuranceRequirement: null,
    manualApprovalRequired: false,
    notes: 'Org default',
  };

  it('canonicalizes all rule fields in stable order', () => {
    const canonical = canonicalizeRuleFields({ minimumAgeYears: 21 });
    expect(Object.keys(canonical)).toEqual([
      'minimumAgeYears',
      'minimumLicenseHoldingMonths',
      'depositAmountCents',
      'depositCurrency',
      'creditCardRequired',
      'foreignTravelPolicy',
      'additionalDriverPolicy',
      'youngDriverPolicy',
      'insuranceRequirement',
      'manualApprovalRequired',
      'notes',
    ]);
    expect(canonical.minimumLicenseHoldingMonths).toBeNull();
  });

  it('builds organization scope document with scopeMeta', () => {
    const doc = buildNormalizedRentalRulesDocument({
      scopeType: 'ORGANIZATION',
      row: orgRow,
    });
    expect(doc.scopeMeta).toEqual({ isActive: true });
    expect(doc.rules.minimumAgeYears).toBe(21);
  });

  it('produces stable hash for identical documents', () => {
    const doc = buildNormalizedRentalRulesDocument({
      scopeType: 'ORGANIZATION',
      row: orgRow,
    });
    const hashA = computeRentalRulesHash(doc);
    const hashB = computeRentalRulesHash({
      rules: { ...doc.rules },
      scopeMeta: { ...doc.scopeMeta },
    });
    expect(hashA).toHaveLength(64);
    expect(hashA).toBe(hashB);
  });

  it('changes hash when rule values change', () => {
    const base = buildNormalizedRentalRulesDocument({ scopeType: 'ORGANIZATION', row: orgRow });
    const changed = buildNormalizedRentalRulesDocument({
      scopeType: 'ORGANIZATION',
      row: { ...orgRow, minimumAgeYears: 25 },
    });
    expect(computeRentalRulesHash(base)).not.toBe(computeRentalRulesHash(changed));
  });

  it('builds category scope meta with sorted keys', () => {
    const doc = buildNormalizedRentalRulesDocument({
      scopeType: 'CATEGORY',
      row: {
        ...orgRow,
        id: 'cat-1',
        name: 'Premium',
        status: 'ACTIVE',
        type: 'PREMIUM',
      },
    });
    expect(Object.keys(doc.scopeMeta)).toEqual([
      'color',
      'description',
      'icon',
      'isActive',
      'name',
      'status',
      'type',
    ]);
    const snapshot = buildRentalRuleRevisionSnapshot({
      scopeType: 'CATEGORY',
      row: {
        ...orgRow,
        name: 'Premium',
        status: 'ACTIVE',
        type: 'PREMIUM',
      },
    });
    expect(snapshot.rulesHash).toHaveLength(64);
  });

  it('uses deterministic stringify', () => {
    const doc = buildNormalizedRentalRulesDocument({ scopeType: 'ORGANIZATION', row: orgRow });
    expect(stableStringifyNormalizedRules(doc)).toBe(stableStringifyNormalizedRules(doc));
  });
});
