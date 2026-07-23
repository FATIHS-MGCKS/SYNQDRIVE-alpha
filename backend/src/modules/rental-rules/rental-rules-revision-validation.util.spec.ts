import { BadRequestException } from '@nestjs/common';
import { validateNormalizedRentalRulesDocument } from './rental-rules-revision-validation.util';
import { buildNormalizedRentalRulesDocument } from './rental-rules-revision.util';

describe('rental-rules-revision-validation.util', () => {
  it('accepts valid organization revision documents', () => {
    const document = buildNormalizedRentalRulesDocument({
      scopeType: 'ORGANIZATION',
      row: { minimumAgeYears: 21, isActive: true },
    });
    expect(() => validateNormalizedRentalRulesDocument(document)).not.toThrow();
  });

  it('rejects invalid minimum age', () => {
    const document = buildNormalizedRentalRulesDocument({
      scopeType: 'ORGANIZATION',
      row: { minimumAgeYears: 10, isActive: true },
    });
    expect(() => validateNormalizedRentalRulesDocument(document)).toThrow(BadRequestException);
  });
});
