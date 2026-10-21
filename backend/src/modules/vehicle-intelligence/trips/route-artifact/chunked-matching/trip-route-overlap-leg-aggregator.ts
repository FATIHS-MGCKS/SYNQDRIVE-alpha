import type { MapMatchedLeg } from '../../mapbox.service';
import {
  TRIP_ROUTE_CHUNK_OVERLAP_COORDINATES,
} from './trip-route-chunked-matching.constants';
import type { MapMatchedChunkResult } from './trip-route-chunked-matching.types';

function sumLegDistance(legs: MapMatchedLeg[]): number {
  return legs.reduce((sum, leg) => sum + leg.distance, 0);
}

function trimLegsFromStart(legs: MapMatchedLeg[], metersToTrim: number): MapMatchedLeg[] {
  if (metersToTrim <= 0) return legs;
  const trimmed: MapMatchedLeg[] = [];
  let remaining = metersToTrim;

  for (const leg of legs) {
    if (remaining <= 0) {
      trimmed.push(leg);
      continue;
    }
    if (leg.distance <= remaining) {
      remaining -= leg.distance;
      continue;
    }
    const keptDistance = leg.distance - remaining;
    const ratio = keptDistance / leg.distance;
    trimmed.push({
      ...leg,
      distance: keptDistance,
      duration: leg.duration * ratio,
    });
    remaining = 0;
  }

  return trimmed;
}

/**
 * Deterministic overlap-aware leg aggregation within one continuous segment.
 * Later chunks drop the overlapping prefix distance from their legs.
 */
export function aggregateSegmentLegsWithoutOverlap(
  chunks: MapMatchedChunkResult[],
  overlapCoordinates: number = TRIP_ROUTE_CHUNK_OVERLAP_COORDINATES,
): MapMatchedLeg[] {
  const successful = chunks
    .filter((chunk) => chunk.status === 'SUCCESS')
    .sort((a, b) => a.chunkIndex - b.chunkIndex);

  if (successful.length === 0) return [];

  const legs: MapMatchedLeg[] = [...successful[0].legs];

  for (let i = 1; i < successful.length; i++) {
    const chunk = successful[i];
    const sourcePoints = chunk.sourceEndIndex - chunk.sourceStartIndex;
    const overlapFraction = Math.min(
      0.99,
      overlapCoordinates / Math.max(sourcePoints, 1),
    );
    const overlapMeters =
      (chunk.matchedDistanceMeters || sumLegDistance(chunk.legs)) * overlapFraction;
    legs.push(...trimLegsFromStart(chunk.legs, overlapMeters));
  }

  return legs;
}

export function aggregateRouteLegsWithoutOverlap(
  chunksBySegment: MapMatchedChunkResult[][],
  overlapCoordinates: number = TRIP_ROUTE_CHUNK_OVERLAP_COORDINATES,
): MapMatchedLeg[] {
  const legs: MapMatchedLeg[] = [];
  for (const segmentChunks of chunksBySegment) {
    legs.push(...aggregateSegmentLegsWithoutOverlap(segmentChunks, overlapCoordinates));
  }
  return legs;
}

export function effectiveChunkSourceDistance(
  chunk: MapMatchedChunkResult,
  overlapCoordinates: number,
  isFirstInSegment: boolean,
): number {
  if (chunk.status !== 'SUCCESS') return 0;
  const sourcePoints = chunk.sourceEndIndex - chunk.sourceStartIndex;
  if (isFirstInSegment) return Math.max(chunk.sourceDistanceMeters, 1);
  const overlapFraction = Math.min(0.99, overlapCoordinates / Math.max(sourcePoints, 1));
  return Math.max(chunk.sourceDistanceMeters * (1 - overlapFraction), 1);
}
