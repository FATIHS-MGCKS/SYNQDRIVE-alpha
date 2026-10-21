import {
  TRIP_ROUTE_CHUNK_MAX_COORDINATES,
  TRIP_ROUTE_CHUNK_OVERLAP_COORDINATES,
} from './trip-route-chunked-matching.constants';
import type { RouteChunkPlan } from './trip-route-chunked-matching.types';

/**
 * Deterministic chronological chunk plan with fixed overlap.
 * end index is exclusive.
 */
export function planRouteChunks(
  pointCount: number,
  segmentIndex: number,
  maxSize: number = TRIP_ROUTE_CHUNK_MAX_COORDINATES,
  overlap: number = TRIP_ROUTE_CHUNK_OVERLAP_COORDINATES,
): RouteChunkPlan[] {
  if (pointCount <= 0) return [];
  if (pointCount <= 2) {
    return [
      {
        segmentIndex,
        chunkIndex: 0,
        sourceStartIndex: 0,
        sourceEndIndex: pointCount,
      },
    ];
  }

  if (pointCount <= maxSize) {
    return [
      {
        segmentIndex,
        chunkIndex: 0,
        sourceStartIndex: 0,
        sourceEndIndex: pointCount,
      },
    ];
  }

  const plans: RouteChunkPlan[] = [];
  const step = maxSize - overlap;
  let start = 0;
  let chunkIndex = 0;

  while (start < pointCount - 1) {
    const end = Math.min(start + maxSize, pointCount);
    plans.push({ segmentIndex, chunkIndex, sourceStartIndex: start, sourceEndIndex: end });
    if (end >= pointCount) break;
    start += step;
    chunkIndex += 1;
  }

  return plans;
}

export function estimateMapboxRequestCount(
  pointCount: number,
  maxSize: number = TRIP_ROUTE_CHUNK_MAX_COORDINATES,
  overlap: number = TRIP_ROUTE_CHUNK_OVERLAP_COORDINATES,
): number {
  return planRouteChunks(pointCount, 0, maxSize, overlap).length;
}
