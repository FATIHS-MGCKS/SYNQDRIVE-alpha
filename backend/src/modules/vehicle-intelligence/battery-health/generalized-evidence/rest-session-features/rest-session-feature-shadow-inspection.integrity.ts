import type { BatteryRestSessionFeature } from '@prisma/client';
import { computeFeatureInputDigestFromSnapshot } from './feature-input-canonical.serializer';
import type { RestSessionFeatureInputSnapshotV1 } from './rest-session-feature-input-snapshot.types';
import type { RestSessionFeatureRevisionIntegrityAggregate } from './rest-session-feature-inspection.repository.types';

export function verifyPersistedFeatureRowDigest(row: BatteryRestSessionFeature): boolean {
  try {
    const recomputed = computeFeatureInputDigestFromSnapshot(
      row.inputSummary as RestSessionFeatureInputSnapshotV1,
    );
    return recomputed === row.inputDigest;
  } catch {
    return false;
  }
}

export function deriveSemanticRevisionIntegrityFromAggregate(
  aggregate: RestSessionFeatureRevisionIntegrityAggregate,
): {
  semanticRevisionGapCount: number;
  duplicateSemanticRevisionCount: number;
} {
  if (aggregate.totalRows === 0) {
    return { semanticRevisionGapCount: 0, duplicateSemanticRevisionCount: 0 };
  }

  const duplicateSemanticRevisionCount = Math.max(
    0,
    aggregate.positiveRevisionRowCount - aggregate.distinctPositiveRevisionCount,
  );

  let semanticRevisionGapCount = 0;
  if (aggregate.distinctPositiveRevisionCount === 0) {
    if (aggregate.nonPositiveRevisionRowCount > 0) {
      semanticRevisionGapCount = 1;
    }
    return { semanticRevisionGapCount, duplicateSemanticRevisionCount };
  }

  const maxPositive = aggregate.maxPositiveSemanticRevision ?? 0;
  semanticRevisionGapCount = Math.max(
    0,
    maxPositive - aggregate.distinctPositiveRevisionCount,
  );
  if (aggregate.nonPositiveRevisionRowCount > 0) {
    semanticRevisionGapCount += 1;
  }

  return { semanticRevisionGapCount, duplicateSemanticRevisionCount };
}

/** Pure-function lineage check (unit tests); inspection uses DB aggregate derivation. */
export function analyzeSemanticRevisionIntegrity(revisions: number[]): {
  semanticRevisionGapCount: number;
  duplicateSemanticRevisionCount: number;
} {
  if (revisions.length === 0) {
    return { semanticRevisionGapCount: 0, duplicateSemanticRevisionCount: 0 };
  }

  const sorted = [...revisions].sort((a, b) => a - b);
  let duplicateSemanticRevisionCount = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] === sorted[i - 1]) duplicateSemanticRevisionCount += 1;
  }

  const unique = [...new Set(sorted)].filter((r) => r > 0).sort((a, b) => a - b);
  if (unique.length === 0) {
    return {
      semanticRevisionGapCount: revisions.some((r) => r <= 0) ? 1 : 0,
      duplicateSemanticRevisionCount,
    };
  }

  let semanticRevisionGapCount = 0;
  if (unique[0] !== 1) semanticRevisionGapCount += unique[0] - 1;
  for (let i = 1; i < unique.length; i += 1) {
    const gap = unique[i] - unique[i - 1] - 1;
    if (gap > 0) semanticRevisionGapCount += gap;
  }
  if (revisions.some((r) => r <= 0)) semanticRevisionGapCount += 1;

  return { semanticRevisionGapCount, duplicateSemanticRevisionCount };
}
