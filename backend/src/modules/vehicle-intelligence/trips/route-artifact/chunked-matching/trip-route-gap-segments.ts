import type { TripRouteLngLat } from '../trip-route-geometry';
import type { MeasuredRoutePoint, TripRouteTelemetryGap } from '../trip-route-preprocessing.types';
import type { ContinuousRouteSegment } from './trip-route-chunked-matching.types';

/**
 * Split FILTERED geometry into continuous segments at R2 UNKNOWN gap boundaries.
 * Mapbox must never match across these boundaries.
 */
export function splitFilteredPointsByGaps(
  points: MeasuredRoutePoint[],
  gaps: TripRouteTelemetryGap[],
): ContinuousRouteSegment[] {
  if (points.length === 0) return [];
  if (gaps.length === 0) {
    return [
      {
        segmentIndex: 0,
        points: [...points],
        geometry: points.map((p) => [p.longitude, p.latitude]),
      },
    ];
  }

  const gapStarts = new Set(gaps.map((g) => g.beforeFilteredPointIndex));
  const segments: ContinuousRouteSegment[] = [];
  let current: MeasuredRoutePoint[] = [];
  let segmentIndex = 0;

  for (let i = 0; i < points.length; i++) {
    if (gapStarts.has(i) && current.length > 0) {
      segments.push({
        segmentIndex,
        points: current,
        geometry: current.map((p) => [p.longitude, p.latitude]),
      });
      segmentIndex += 1;
      current = [];
    }
    current.push(points[i]);
  }

  if (current.length > 0) {
    segments.push({
      segmentIndex,
      points: current,
      geometry: current.map((p) => [p.longitude, p.latitude]),
    });
  }

  return segments;
}

export function mapGapsToMatchedBoundaries(
  gaps: TripRouteTelemetryGap[],
  segmentPointCounts: number[],
): import('./trip-route-chunked-matching.types').MatchedSegmentBoundary[] {
  if (gaps.length === 0 || segmentPointCounts.length < 2) return [];

  let offset = 0;
  const boundaries: import('./trip-route-chunked-matching.types').MatchedSegmentBoundary[] = [];

  for (let seg = 0; seg < segmentPointCounts.length - 1; seg++) {
    offset += segmentPointCounts[seg];
    const gap = gaps.find((g) => g.afterFilteredPointIndex === offset - 1);
    if (gap) {
      boundaries.push({
        segmentIndex: seg,
        afterMatchedPointIndex: offset - 1,
        beforeMatchedPointIndex: offset,
        gapSeconds: gap.gapSeconds,
        continuity: 'UNKNOWN',
      });
    }
  }

  return boundaries;
}
