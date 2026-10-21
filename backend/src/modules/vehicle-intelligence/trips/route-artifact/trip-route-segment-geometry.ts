import type { TripRouteLngLat } from './trip-route-geometry';
import type { TripRouteTelemetryGap } from './trip-route-preprocessing.types';
import type { MatchedSegmentBoundary } from './chunked-matching/trip-route-chunked-matching.types';

export interface GeometryGapBoundary {
  afterIndex: number;
  beforeIndex: number;
}

function toRenderableSegments(segments: TripRouteLngLat[][]): TripRouteLngLat[][] {
  return segments.filter((segment) => segment.length >= 2);
}

export function sanitizeMatchedSegmentBoundaries(
  geometryLength: number,
  boundaries: MatchedSegmentBoundary[],
): MatchedSegmentBoundary[] {
  if (geometryLength < 2 || boundaries.length === 0) return [];
  return boundaries.filter((boundary) => {
    const after = boundary.afterMatchedPointIndex;
    const before = boundary.beforeMatchedPointIndex;
    return (
      Number.isInteger(after) &&
      Number.isInteger(before) &&
      after >= 0 &&
      before > after &&
      before < geometryLength &&
      after < geometryLength - 1
    );
  });
}

/**
 * Split a flat geometry array at explicit gap boundaries.
 * Never connects coordinates across an UNKNOWN gap.
 */
export function splitGeometryAtGapBoundaries(
  geometry: TripRouteLngLat[],
  boundaries: GeometryGapBoundary[],
): TripRouteLngLat[][] {
  if (geometry.length < 2) return [];
  if (boundaries.length === 0) return [geometry];

  const sorted = [...boundaries].sort((a, b) => a.afterIndex - b.afterIndex);
  const segments: TripRouteLngLat[][] = [];
  let start = 0;

  for (const boundary of sorted) {
    const endExclusive = boundary.afterIndex + 1;
    if (endExclusive > start) {
      const segment = geometry.slice(start, endExclusive);
      if (segment.length >= 2) segments.push(segment);
    }
    start = boundary.beforeIndex;
  }

  const tail = geometry.slice(start);
  if (tail.length >= 2) segments.push(tail);

  return toRenderableSegments(segments);
}

export function splitFilteredGeometryByGaps(
  geometry: TripRouteLngLat[],
  gaps: TripRouteTelemetryGap[],
): TripRouteLngLat[][] {
  if (geometry.length < 2) return [];
  return splitGeometryAtGapBoundaries(
    geometry,
    gaps.map((gap) => ({
      afterIndex: gap.afterFilteredPointIndex,
      beforeIndex: gap.beforeFilteredPointIndex,
    })),
  );
}

export function splitMatchedGeometryByBoundaries(
  geometry: TripRouteLngLat[],
  boundaries: MatchedSegmentBoundary[],
): TripRouteLngLat[][] {
  if (geometry.length < 2) return [];
  const sanitized = sanitizeMatchedSegmentBoundaries(geometry.length, boundaries);
  return splitGeometryAtGapBoundaries(
    geometry,
    sanitized.map((boundary) => ({
      afterIndex: boundary.afterMatchedPointIndex,
      beforeIndex: boundary.beforeMatchedPointIndex,
    })),
  );
}

export function detectWaypointGapBoundaries(
  timestamps: string[],
  gapThresholdSeconds: number,
): GeometryGapBoundary[] {
  const boundaries: GeometryGapBoundary[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    const prev = Date.parse(timestamps[i - 1]);
    const next = Date.parse(timestamps[i]);
    if (!Number.isFinite(prev) || !Number.isFinite(next)) continue;
    const gapSeconds = Math.max(0, (next - prev) / 1000);
    if (gapSeconds >= gapThresholdSeconds) {
      boundaries.push({
        afterIndex: i - 1,
        beforeIndex: i,
      });
    }
  }
  return boundaries;
}

export function splitWaypointGeometryByTimestamps(
  geometry: TripRouteLngLat[],
  timestamps: string[],
  gapThresholdSeconds: number,
): TripRouteLngLat[][] {
  if (geometry.length < 2 || geometry.length !== timestamps.length) {
    return geometry.length >= 2 ? [geometry] : [];
  }
  return splitGeometryAtGapBoundaries(
    geometry,
    detectWaypointGapBoundaries(timestamps, gapThresholdSeconds),
  );
}

export function toMultiLineStringGeometry(
  segments: TripRouteLngLat[][],
): { type: 'MultiLineString'; coordinates: TripRouteLngLat[][] } | null {
  const renderable = toRenderableSegments(segments);
  if (renderable.length === 0) return null;
  return {
    type: 'MultiLineString',
    coordinates: renderable,
  };
}
