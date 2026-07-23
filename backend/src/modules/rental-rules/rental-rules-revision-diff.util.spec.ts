import { buildNormalizedRentalRulesDocument } from './rental-rules-revision.util';
import { buildRentalRuleRevisionDiff } from './rental-rules-revision-diff.util';

describe('rental-rules-revision-diff.util', () => {
  const active = buildNormalizedRentalRulesDocument({
    scopeType: 'ORGANIZATION',
    row: { minimumAgeYears: 21, depositAmountCents: 10000, isActive: true },
  });
  const draft = buildNormalizedRentalRulesDocument({
    scopeType: 'ORGANIZATION',
    row: {
      minimumAgeYears: 25,
      depositAmountCents: null,
      manualApprovalRequired: true,
      isActive: true,
    },
  });

  it('classifies added, changed, and removed rule fields with sources', () => {
    const diff = buildRentalRuleRevisionDiff({
      scopeType: 'ORGANIZATION',
      scopeId: 'org1',
      active,
      draft,
    });

    expect(diff.changedRules).toEqual([
      expect.objectContaining({
        field: 'minimumAgeYears',
        kind: 'changed',
        previousValue: 21,
        newValue: 25,
        previousSource: 'ORGANIZATION_DEFAULT',
        newSource: 'ORGANIZATION_DEFAULT',
      }),
    ]);
    expect(diff.removedRules).toEqual([
      expect.objectContaining({ field: 'depositAmountCents', kind: 'removed' }),
    ]);
    expect(diff.addedRules).toEqual([
      expect.objectContaining({ field: 'manualApprovalRequired', kind: 'added', newValue: true }),
    ]);
    expect(diff.hasChanges).toBe(true);
  });
});
