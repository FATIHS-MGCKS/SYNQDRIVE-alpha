import { analyzeSemanticRevisionIntegrity } from './rest-session-feature-shadow-inspection.integrity';

describe('rest-session-feature-shadow-inspection.integrity', () => {
  it('TEST_I9: revisions 1,2,3 → gap count 0', () => {
    expect(analyzeSemanticRevisionIntegrity([1, 2, 3])).toEqual({
      semanticRevisionGapCount: 0,
      duplicateSemanticRevisionCount: 0,
    });
  });

  it('TEST_I10: revisions 1,3 → gap count 1', () => {
    expect(analyzeSemanticRevisionIntegrity([1, 3])).toEqual({
      semanticRevisionGapCount: 1,
      duplicateSemanticRevisionCount: 0,
    });
  });
});
