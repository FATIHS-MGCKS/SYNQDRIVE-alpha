import type { DiV0ShadowInterval } from '@prisma/client';
import type { DiV0ShadowPersistedIntervalInput } from './di-v0-shadow-types';

export interface DiV0ShadowDerivedCompletionSummary {
  intervalCount: number;
  numericSpeedCount: number;
  abstentionCount: number;
  conflictCount: number;
}

export function deriveCompletionCountsFromRows(
  rows: DiV0ShadowPersistedIntervalInput[],
): DiV0ShadowDerivedCompletionSummary {
  let numericSpeedCount = 0;
  let abstentionCount = 0;
  let conflictCount = 0;
  for (const row of rows) {
    if (row.estimatedSpeedKmh != null) {
      numericSpeedCount += 1;
    }
    if (row.abstentionReason != null) {
      abstentionCount += 1;
    }
    if (row.sourceRelation === 'CONFLICTING') {
      conflictCount += 1;
    }
  }
  return {
    intervalCount: rows.length,
    numericSpeedCount,
    abstentionCount,
    conflictCount,
  };
}

export function deriveCompletionCountsFromPersistedIntervals(
  intervals: Pick<
    DiV0ShadowInterval,
    'estimatedSpeedKmh' | 'abstentionReason' | 'sourceRelation'
  >[],
): DiV0ShadowDerivedCompletionSummary {
  let numericSpeedCount = 0;
  let abstentionCount = 0;
  let conflictCount = 0;
  for (const row of intervals) {
    if (row.estimatedSpeedKmh != null) {
      numericSpeedCount += 1;
    }
    if (row.abstentionReason != null) {
      abstentionCount += 1;
    }
    if (row.sourceRelation === 'CONFLICTING') {
      conflictCount += 1;
    }
  }
  return {
    intervalCount: intervals.length,
    numericSpeedCount,
    abstentionCount,
    conflictCount,
  };
}
