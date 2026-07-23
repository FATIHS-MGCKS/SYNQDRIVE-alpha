import {
  buildRentalRuleRevisionPreview,
} from './rental-rules-revision-preview.util';
import { buildNormalizedRentalRulesDocument } from './rental-rules-revision.util';

describe('rental-rules-revision-preview.util', () => {
  const active = buildNormalizedRentalRulesDocument({
    scopeType: 'ORGANIZATION',
    row: { minimumAgeYears: 21, isActive: true },
  });
  const draft = buildNormalizedRentalRulesDocument({
    scopeType: 'ORGANIZATION',
    row: { minimumAgeYears: 25, isActive: true },
  });

  it('builds diff between active and draft documents', () => {
    const result = buildRentalRuleRevisionPreview({
      mode: 'diff',
      active,
      draft,
    });
    expect(result.hasChanges).toBe(true);
    expect(result.ruleDiffs.find((row) => row.field === 'minimumAgeYears')).toEqual({
      field: 'minimumAgeYears',
      active: 21,
      draft: 25,
      changed: true,
    });
  });
});
