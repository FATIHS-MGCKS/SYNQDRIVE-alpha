import { MapboxService } from '../../mapbox.service';
import type { TripRouteLngLat } from '../trip-route-geometry';
import { TRIP_ROUTE_SEAM_MAX_DISTANCE_METERS } from './trip-route-chunked-matching.constants';
import type { MapMatchedChunkResult } from './trip-route-chunked-matching.types';

function nearPoint(
  a: TripRouteLngLat,
  b: TripRouteLngLat,
  toleranceM: number,
): boolean {
  return (
    MapboxService.haversineM(a[1], a[0], b[1], b[0]) <= toleranceM
  );
}

export interface StitchResult {
  geometry: TripRouteLngLat[];
  maxSeamDistanceMeters: number;
  seamFailures: string[];
}

/**
 * Deterministic stitch of chunk geometries using overlap anchors.
 */
export function stitchChunkGeometries(
  chunks: MapMatchedChunkResult[],
): StitchResult {
  const successful = chunks.filter(
    (c) => c.status === 'SUCCESS' && c.matchedGeometry.length > 0,
  );
  if (successful.length === 0) {
    return { geometry: [], maxSeamDistanceMeters: 0, seamFailures: ['no_successful_chunks'] };
  }

  let geometry: TripRouteLngLat[] = [...successful[0].matchedGeometry];
  let maxSeam = 0;
  const seamFailures: string[] = [];

  for (let i = 1; i < successful.length; i++) {
    const next = successful[i].matchedGeometry;
    let joinAt = 0;
    let bestDist = Number.POSITIVE_INFINITY;

    const searchTail = geometry.slice(Math.max(0, geometry.length - 20));
    const searchHead = next.slice(0, Math.min(20, next.length));

    for (let ti = 0; ti < searchTail.length; ti++) {
      for (let ni = 0; ni < searchHead.length; ni++) {
        const d = MapboxService.haversineM(
          searchTail[ti][1],
          searchTail[ti][0],
          searchHead[ni][1],
          searchHead[ni][0],
        );
        if (d < bestDist) {
          bestDist = d;
          joinAt = ni + 1;
        }
      }
    }

    maxSeam = Math.max(maxSeam, bestDist);
    if (bestDist > TRIP_ROUTE_SEAM_MAX_DISTANCE_METERS) {
      seamFailures.push(
        `chunk_seam_${i - 1}_${i}_distance_${Math.round(bestDist)}m`,
      );
    }

    geometry = geometry.concat(next.slice(joinAt));
    if (
      joinAt > 0 &&
      next[joinAt - 1] &&
      geometry.length > 0 &&
      !nearPoint(geometry[geometry.length - 1], next[joinAt - 1], 2)
    ) {
      // remove near-duplicate seam vertex
      const last = geometry[geometry.length - 1];
      if (nearPoint(last, next[joinAt - 1], 2)) {
        geometry.pop();
      }
    }
  }

  return { geometry, maxSeamDistanceMeters: maxSeam, seamFailures };
}

export function geometryDistanceMeters(geometry: TripRouteLngLat[]): number {
  let total = 0;
  for (let i = 1; i < geometry.length; i++) {
    total += MapboxService.haversineM(
      geometry[i - 1][1],
      geometry[i - 1][0],
      geometry[i][1],
      geometry[i][0],
    );
  }
  return total;
}
