import { MapboxService } from '../../mapbox.service';
import type { TripRouteLngLat } from '../trip-route-geometry';
import { TRIP_ROUTE_SEAM_MAX_DISTANCE_METERS } from './trip-route-chunked-matching.constants';
import type { MapMatchedChunkResult } from './trip-route-chunked-matching.types';

export interface StitchResult {
  geometry: TripRouteLngLat[];
  maxSeamDistanceMeters: number;
  seamFailures: string[];
}

function seamDistance(a: TripRouteLngLat, b: TripRouteLngLat): number {
  return MapboxService.haversineM(a[1], a[0], b[1], b[0]);
}

function geometricJoinIndex(
  tail: TripRouteLngLat[],
  head: TripRouteLngLat[],
): { joinAt: number; bestDist: number } {
  let joinAt = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  const searchTail = tail.slice(Math.max(0, tail.length - 20));
  const searchHead = head.slice(0, Math.min(20, head.length));

  for (let ti = 0; ti < searchTail.length; ti++) {
    for (let ni = 0; ni < searchHead.length; ni++) {
      const d = seamDistance(searchTail[ti], searchHead[ni]);
      if (d < bestDist) {
        bestDist = d;
        joinAt = ni + 1;
      }
    }
  }

  return { joinAt, bestDist };
}

/**
 * Deterministic stitch of chunk geometries using source-index overlap anchors.
 */
export function stitchChunkGeometries(
  chunks: MapMatchedChunkResult[],
): StitchResult {
  const successful = chunks
    .filter((c) => c.status === 'SUCCESS' && c.matchedGeometry.length > 0)
    .sort((a, b) => a.chunkIndex - b.chunkIndex);

  if (successful.length === 0) {
    return { geometry: [], maxSeamDistanceMeters: 0, seamFailures: ['no_successful_chunks'] };
  }

  let geometry: TripRouteLngLat[] = [...successful[0].matchedGeometry];
  let maxSeam = 0;
  const seamFailures: string[] = [];

  for (let i = 1; i < successful.length; i++) {
    const prev = successful[i - 1];
    const nextChunk = successful[i];
    const next = nextChunk.matchedGeometry;
    const overlapCount = Math.max(0, prev.sourceEndIndex - nextChunk.sourceStartIndex);

    let joinAt = 0;
    let bestDist = Number.POSITIVE_INFINITY;

    if (overlapCount > 0 && overlapCount < next.length) {
      joinAt = overlapCount;
      const tail = geometry[geometry.length - 1];
      const head = next[overlapCount - 1];
      bestDist = seamDistance(tail, head);
    } else {
      const geometric = geometricJoinIndex(geometry, next);
      joinAt = geometric.joinAt;
      bestDist = geometric.bestDist;
    }

    maxSeam = Math.max(maxSeam, bestDist);
    if (bestDist > TRIP_ROUTE_SEAM_MAX_DISTANCE_METERS) {
      seamFailures.push(
        `chunk_seam_${i - 1}_${i}_distance_${Math.round(bestDist)}m`,
      );
    }

    geometry = geometry.concat(next.slice(joinAt));
  }

  return { geometry, maxSeamDistanceMeters: maxSeam, seamFailures };
}

export function geometryDistanceMeters(geometry: TripRouteLngLat[]): number {
  let total = 0;
  for (let i = 1; i < geometry.length; i++) {
    total += seamDistance(geometry[i - 1], geometry[i]);
  }
  return total;
}
