import type { F5SegmentationSummaryForCorrelation } from './f5-ground-truth-correlation.types';

export function emptyF5SegmentationSummary(): F5SegmentationSummaryForCorrelation {
  return {
    segmentAssignedRevisionCount: 0,
    interventionCrossingRevisionCount: 0,
    unlabeledRevisionCount: 0,
    missingAnchorRevisionCount: 0,
    totalDerivedSegmentCount: 0,
    maxSegmentCountPerVehicle: 0,
    prePostReplacementPoolingBlockedBySegmentAssignment: false,
  };
}
