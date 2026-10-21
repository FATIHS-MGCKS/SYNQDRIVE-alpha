import type { RestSessionFeatureRevisionIntegrityAggregate } from './rest-session-feature-inspection.repository.types';
import {
  analyzeSemanticRevisionIntegrity,
  deriveSemanticRevisionIntegrityFromAggregate,
} from './rest-session-feature-shadow-inspection.integrity';

function aggregateFromRevisions(revisions: number[]): RestSessionFeatureRevisionIntegrityAggregate {
  const positive = revisions.filter((r) => r > 0);
  const distinctPositive = new Set(positive);
  return {
    totalRows: revisions.length,
    incrementalRows: 0,
    finalRows: 0,
    validRows: 0,
    invalidatedRows: 0,
    latestSemanticRevision: revisions.length ? Math.max(...revisions) : null,
    positiveRevisionRowCount: positive.length,
    distinctPositiveRevisionCount: distinctPositive.size,
    minPositiveSemanticRevision: positive.length ? Math.min(...positive) : null,
    maxPositiveSemanticRevision: positive.length ? Math.max(...positive) : null,
    nonPositiveRevisionRowCount: revisions.filter((r) => r <= 0).length,
  };
}

describe('rest-session-feature-shadow-inspection.integrity', () => {
  it('TEST_I9: revisions 1,2,3 → gap count 0', () => {
    expect(analyzeSemanticRevisionIntegrity([1, 2, 3])).toEqual({
      semanticRevisionGapCount: 0,
      duplicateSemanticRevisionCount: 0,
    });
    expect(deriveSemanticRevisionIntegrityFromAggregate(aggregateFromRevisions([1, 2, 3]))).toEqual({
      semanticRevisionGapCount: 0,
      duplicateSemanticRevisionCount: 0,
    });
  });

  it('TEST_I10: revisions 1,3 → gap count 1', () => {
    expect(analyzeSemanticRevisionIntegrity([1, 3])).toEqual({
      semanticRevisionGapCount: 1,
      duplicateSemanticRevisionCount: 0,
    });
    expect(deriveSemanticRevisionIntegrityFromAggregate(aggregateFromRevisions([1, 3]))).toEqual({
      semanticRevisionGapCount: 1,
      duplicateSemanticRevisionCount: 0,
    });
  });

  it('REVISION_AGGREGATE: 1,2,2,3 → duplicate detected', () => {
    const derived = deriveSemanticRevisionIntegrityFromAggregate(aggregateFromRevisions([1, 2, 2, 3]));
    expect(derived.duplicateSemanticRevisionCount).toBe(1);
    expect(analyzeSemanticRevisionIntegrity([1, 2, 2, 3]).duplicateSemanticRevisionCount).toBe(1);
  });

  it('REVISION_AGGREGATE: 3,4 → missing 1,2', () => {
    expect(deriveSemanticRevisionIntegrityFromAggregate(aggregateFromRevisions([3, 4]))).toEqual({
      semanticRevisionGapCount: 2,
      duplicateSemanticRevisionCount: 0,
    });
  });

  it('REVISION_AGGREGATE: 0,1,2 → non-positive anomaly', () => {
    expect(deriveSemanticRevisionIntegrityFromAggregate(aggregateFromRevisions([0, 1, 2]))).toEqual({
      semanticRevisionGapCount: 1,
      duplicateSemanticRevisionCount: 0,
    });
  });
});
