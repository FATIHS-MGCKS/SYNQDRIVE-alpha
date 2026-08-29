import { MapboxService } from '../../mapbox.service';
import type { TripRouteLngLat } from '../trip-route-geometry';
import type { MeasuredRoutePoint, TripRouteTelemetryGap } from '../trip-route-preprocessing.types';
import type { ContinuousRouteSegment } from './trip-route-chunked-matching.types';
import { splitFilteredPointsByGaps } from './trip-route-gap-segments';
import { sourceDistanceMeters } from './trip-route-trajectory-retention';

export const MAX_MATCHED_VERTEX_JUMP_METERS = 500;

/** Sum haversine distance within each continuous segment — excludes UNKNOWN gap chords. */
export function filteredDistanceAcrossSegments(
  points: MeasuredRoutePoint[],
  gaps: TripRouteTelemetryGap[],
): number {
  return splitFilteredPointsByGaps(points, gaps).reduce(
    (sum, segment) => sum + sourceDistanceMeters(segment.points),
    0,
  );
}

/** Sum geometry distance per continuous matched segment — no cross-gap edges. */
export function matchedDistanceAcrossSegments(segmentGeometries: TripRouteLngLat[][]): number {
  return segmentGeometries.reduce((sum, geometry) => sum + geometryDistanceMeters(geometry), 0);
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

/** Validate each continuous segment independently — never across UNKNOWN gaps. */
export function assertGeometryValidPerSegment(
  segmentGeometries: TripRouteLngLat[][],
): string[] {
  const failures: string[] = [];
  let validSegmentCount = 0;

  for (let i = 0; i < segmentGeometries.length; i++) {
    const geometry = segmentGeometries[i];
    if (geometry.length < 2) {
      failures.push(`matched_segment_${i}_too_short`);
      continue;
    }
    validSegmentCount += 1;
    for (let j = 1; j < geometry.length; j++) {
      const jump = MapboxService.haversineM(
        geometry[j - 1][1],
        geometry[j - 1][0],
        geometry[j][1],
        geometry[j][0],
      );
      if (jump > MAX_MATCHED_VERTEX_JUMP_METERS) {
        failures.push(`impossible_matched_jump_segment_${i}`);
        break;
      }
    }
  }

  if (validSegmentCount === 0) {
    failures.push('matched_geometry_invalid');
  }

  return failures;
}

export function flattenSegmentGeometries(segmentGeometries: TripRouteLngLat[][]): TripRouteLngLat[] {
  return segmentGeometries.flat();
}

export function segmentPointCounts(segmentGeometries: TripRouteLngLat[][]): number[] {
  return segmentGeometries.map((geometry) => geometry.length);
}

export function sumSegmentSourceDistances(segments: ContinuousRouteSegment[]): number {
  return segments.reduce((sum, segment) => sum + sourceDistanceMeters(segment.points), 0);
}
