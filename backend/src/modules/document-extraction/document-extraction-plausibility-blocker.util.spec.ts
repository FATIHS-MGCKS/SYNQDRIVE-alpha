import {
  assertApplyNotBlockedByPlausibility,
  getPlausibilityBlockerCodes,
  hasUnresolvedPlausibilityBlocker,
} from './document-extraction-plausibility-blocker.util';

describe('document-extraction-plausibility-blocker.util', () => {
  it('exposes machine-readable blocker codes', () => {
    const result = {
      overallStatus: 'BLOCKER' as const,
      checks: [
        {
          code: 'PLATE_MISMATCH',
          status: 'BLOCKER' as const,
          message: 'plate mismatch',
          source: 'DOCUMENT' as const,
        },
      ],
      recommendedHumanReviewNotes: [],
    };
    expect(getPlausibilityBlockerCodes(result)).toEqual(['PLATE_MISMATCH']);
    expect(hasUnresolvedPlausibilityBlocker(result)).toBe(true);
  });

  it('throws on assertApplyNotBlockedByPlausibility', () => {
    expect(() =>
      assertApplyNotBlockedByPlausibility({
        overallStatus: 'BLOCKER',
        checks: [
          {
            code: 'NEGATIVE_AMOUNT',
            status: 'BLOCKER',
            message: 'negative',
            source: 'DOCUMENT',
          },
        ],
        recommendedHumanReviewNotes: [],
      }),
    ).toThrow(expect.objectContaining({
      response: expect.objectContaining({
        plausibilityBlockers: ['NEGATIVE_AMOUNT'],
      }),
    }));
  });
});
