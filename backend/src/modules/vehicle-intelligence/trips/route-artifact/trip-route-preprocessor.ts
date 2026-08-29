import { MapboxService } from '../mapbox.service';
import { TRIP_ROUTE_ALGORITHM_VERSION } from './trip-route-algorithm-version';
import {
  TRIP_ROUTE_COORD_DECIMALS,
  TRIP_ROUTE_GAP_THRESHOLD_SECONDS,
  TRIP_ROUTE_MAX_PLAUSIBLE_SPEED_KMH,
  TRIP_ROUTE_MIN_ELAPSED_SECONDS,
  TRIP_ROUTE_NEAR_DUPLICATE_MAX_SECONDS,
  TRIP_ROUTE_NEAR_DUPLICATE_METERS,
  TRIP_ROUTE_SIMPLIFICATION_ACTIVATION_COUNT,
  TRIP_ROUTE_SIMPLIFICATION_TOLERANCE_METERS,
  TRIP_ROUTE_STATIONARY_CLUSTER_METERS,
  TRIP_ROUTE_STATIONARY_MIN_DURATION_SECONDS,
} from './trip-route-preprocessing.constants';
import type {
  MeasuredRoutePoint,
  TripRouteFilterReason,
  TripRoutePreprocessorInput,
  TripRoutePreprocessingResult,
  TripRouteTelemetryGap,
} from './trip-route-preprocessing.types';
import type { TripRouteLngLat } from './trip-route-geometry';
import { canonicalizeTripRouteInputPoints } from './trip-route-input-fingerprint';

const MIN_LNG = -180;
const MAX_LNG = 180;
const MIN_LAT = -90;
const MAX_LAT = 90;

function roundCoord(value: number): number {
  const factor = 10 ** TRIP_ROUTE_COORD_DECIMALS;
  return Math.round(value * factor) / factor;
}

function isValidCoordinate(latitude: number, longitude: number): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (longitude < MIN_LNG || longitude > MAX_LNG) return false;
  if (latitude < MIN_LAT || latitude > MAX_LAT) return false;
  if (longitude === 0 && latitude === 0) return false;
  return true;
}

function toMeasuredPoint(
  point: { latitude: number; longitude: number; recordedAt: string },
  sourceIndex: number,
): MeasuredRoutePoint {
  return {
    latitude: roundCoord(point.latitude),
    longitude: roundCoord(point.longitude),
    recordedAt: point.recordedAt,
    sourceIndex,
  };
}

function elapsedSeconds(a: MeasuredRoutePoint, b: MeasuredRoutePoint): number {
  const ms = Date.parse(b.recordedAt) - Date.parse(a.recordedAt);
  if (!Number.isFinite(ms)) return TRIP_ROUTE_MIN_ELAPSED_SECONDS;
  return Math.max(ms / 1000, TRIP_ROUTE_MIN_ELAPSED_SECONDS);
}

function distanceMeters(a: MeasuredRoutePoint, b: MeasuredRoutePoint): number {
  return MapboxService.haversineM(a.latitude, a.longitude, b.latitude, b.longitude);
}

function impliedSpeedKmh(a: MeasuredRoutePoint, b: MeasuredRoutePoint): number {
  const seconds = elapsedSeconds(a, b);
  const meters = distanceMeters(a, b);
  return (meters / seconds) * 3.6;
}

function coordKey(point: MeasuredRoutePoint): string {
  return `${point.longitude},${point.latitude},${point.recordedAt}`;
}

function perpendicularDistanceMeters(
  point: MeasuredRoutePoint,
  lineStart: MeasuredRoutePoint,
  lineEnd: MeasuredRoutePoint,
): number {
  const lineLen = distanceMeters(lineStart, lineEnd);
  if (lineLen === 0) return distanceMeters(point, lineStart);

  // Planar approximation in local meters — sufficient for simplification tolerance.
  const latScale = 111_320;
  const lonScale = 111_320 * Math.cos(((lineStart.latitude + lineEnd.latitude) / 2) * (Math.PI / 180));
  const px = point.longitude * lonScale;
  const py = point.latitude * latScale;
  const x1 = lineStart.longitude * lonScale;
  const y1 = lineStart.latitude * latScale;
  const x2 = lineEnd.longitude * lonScale;
  const y2 = lineEnd.latitude * latScale;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  const distX = px - projX;
  const distY = py - projY;
  return Math.sqrt(distX * distX + distY * distY);
}

function gapSecondsBetween(a: MeasuredRoutePoint, b: MeasuredRoutePoint): number {
  const ms = Date.parse(b.recordedAt) - Date.parse(a.recordedAt);
  return Number.isFinite(ms) ? ms / 1000 : 0;
}

function isTelemetryGap(a: MeasuredRoutePoint, b: MeasuredRoutePoint): boolean {
  return gapSecondsBetween(a, b) >= TRIP_ROUTE_GAP_THRESHOLD_SECONDS;
}

function splitByTelemetryGaps(points: MeasuredRoutePoint[]): MeasuredRoutePoint[][] {
  if (points.length === 0) return [];
  const segments: MeasuredRoutePoint[][] = [[points[0]]];
  for (let i = 1; i < points.length; i++) {
    if (isTelemetryGap(points[i - 1], points[i])) {
      segments.push([points[i]]);
    } else {
      segments[segments.length - 1].push(points[i]);
    }
  }
  return segments;
}

function detectFilteredGeometryGaps(points: MeasuredRoutePoint[]): TripRouteTelemetryGap[] {
  const gaps: TripRouteTelemetryGap[] = [];
  for (let i = 1; i < points.length; i++) {
    const gapSeconds = gapSecondsBetween(points[i - 1], points[i]);
    if (gapSeconds >= TRIP_ROUTE_GAP_THRESHOLD_SECONDS) {
      gaps.push({
        afterFilteredPointIndex: i - 1,
        beforeFilteredPointIndex: i,
        gapSeconds: Math.round(gapSeconds),
        continuity: 'UNKNOWN',
      });
    }
  }
  return gaps;
}

function processSegments(
  points: MeasuredRoutePoint[],
  processor: (segment: MeasuredRoutePoint[]) => MeasuredRoutePoint[],
): MeasuredRoutePoint[] {
  return splitByTelemetryGaps(points).flatMap((segment) => processor(segment));
}

function removeExactDuplicates(
  points: MeasuredRoutePoint[],
  reasonCounts: Partial<Record<TripRouteFilterReason, number>>,
): MeasuredRoutePoint[] {
  const seen = new Set<string>();
  const out: MeasuredRoutePoint[] = [];
  for (const point of points) {
    const key = coordKey(point);
    if (seen.has(key)) {
      reasonCounts.exact_duplicate = (reasonCounts.exact_duplicate ?? 0) + 1;
      continue;
    }
    seen.add(key);
    out.push(point);
  }
  return out;
}

function removeNearDuplicates(
  points: MeasuredRoutePoint[],
  reasonCounts: Partial<Record<TripRouteFilterReason, number>>,
): MeasuredRoutePoint[] {
  if (points.length === 0) return [];
  const out: MeasuredRoutePoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1];
    const current = points[i];
    const dist = distanceMeters(prev, current);
    const dt = elapsedSeconds(prev, current);
    if (dist <= TRIP_ROUTE_NEAR_DUPLICATE_METERS && dt <= TRIP_ROUTE_NEAR_DUPLICATE_MAX_SECONDS) {
      reasonCounts.near_duplicate = (reasonCounts.near_duplicate ?? 0) + 1;
      continue;
    }
    out.push(current);
  }
  return out;
}

function removeIsolatedSpikes(
  points: MeasuredRoutePoint[],
  reasonCounts: Partial<Record<TripRouteFilterReason, number>>,
  impossibleJumpCount: { value: number },
): MeasuredRoutePoint[] {
  if (points.length < 3) return [...points];

  const drop = new Set<number>();
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const mid = points[i];
    const next = points[i + 1];
    const speedIn = impliedSpeedKmh(prev, mid);
    const speedOut = impliedSpeedKmh(mid, next);
    const speedSkip = impliedSpeedKmh(prev, next);

    const inImpossible = speedIn > TRIP_ROUTE_MAX_PLAUSIBLE_SPEED_KMH;
    const outImpossible = speedOut > TRIP_ROUTE_MAX_PLAUSIBLE_SPEED_KMH;
    const skipPlausible = speedSkip <= TRIP_ROUTE_MAX_PLAUSIBLE_SPEED_KMH;

    if (inImpossible && outImpossible && skipPlausible) {
      drop.add(i);
      reasonCounts.isolated_spike = (reasonCounts.isolated_spike ?? 0) + 1;
      impossibleJumpCount.value += 1;
    } else if (inImpossible || outImpossible) {
      impossibleJumpCount.value += 1;
    }
  }

  return points.filter((_, index) => !drop.has(index));
}

function reduceStationaryClusters(
  points: MeasuredRoutePoint[],
  reasonCounts: Partial<Record<TripRouteFilterReason, number>>,
): MeasuredRoutePoint[] {
  if (points.length < 3) return [...points];

  const keep = new Set<number>([0, points.length - 1]);
  let clusterStart = 0;

  const flushCluster = (start: number, end: number) => {
    if (end < start) return;
    if (end === start) {
      keep.add(start);
      return;
    }
    const duration = elapsedSeconds(points[start], points[end]);
    const span = distanceMeters(points[start], points[end]);
    if (
      duration >= TRIP_ROUTE_STATIONARY_MIN_DURATION_SECONDS &&
      span <= TRIP_ROUTE_STATIONARY_CLUSTER_METERS
    ) {
      keep.add(start);
      keep.add(end);
      for (let i = start + 1; i < end; i++) {
        reasonCounts.stationary_redundancy = (reasonCounts.stationary_redundancy ?? 0) + 1;
      }
    } else {
      for (let i = start; i <= end; i++) keep.add(i);
    }
  };

  for (let i = 1; i < points.length; i++) {
    const span = distanceMeters(points[clusterStart], points[i]);
    if (span > TRIP_ROUTE_STATIONARY_CLUSTER_METERS) {
      flushCluster(clusterStart, i - 1);
      clusterStart = i;
    }
  }
  flushCluster(clusterStart, points.length - 1);

  return points.filter((_, index) => keep.has(index));
}

function simplifyMeasuredVertices(
  points: MeasuredRoutePoint[],
  reasonCounts: Partial<Record<TripRouteFilterReason, number>>,
): MeasuredRoutePoint[] {
  if (points.length < TRIP_ROUTE_SIMPLIFICATION_ACTIVATION_COUNT) return [...points];

  const keep = new Set<number>([0, points.length - 1]);

  const recurse = (start: number, end: number) => {
    if (end - start < 2) return;
    let maxDist = 0;
    let maxIdx = start;
    for (let i = start + 1; i < end; i++) {
      const dist = perpendicularDistanceMeters(points[i], points[start], points[end]);
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }
    if (maxDist > TRIP_ROUTE_SIMPLIFICATION_TOLERANCE_METERS) {
      keep.add(maxIdx);
      recurse(start, maxIdx);
      recurse(maxIdx, end);
    }
  };

  recurse(0, points.length - 1);

  const simplified = points.filter((_, index) => keep.has(index));
  const removed = points.length - simplified.length;
  if (removed > 0) {
    reasonCounts.simplification = (reasonCounts.simplification ?? 0) + removed;
  }
  return simplified;
}

function toGeometry(points: MeasuredRoutePoint[]): TripRouteLngLat[] {
  return points.map((p) => [p.longitude, p.latitude]);
}

/**
 * Deterministic measured-route preprocessor (R2).
 * Uses coordinates + timestamps only — speed does not influence output.
 */
export function preprocessTripRoute(
  input: TripRoutePreprocessorInput,
): TripRoutePreprocessingResult {
  const reasonCounts: Partial<Record<TripRouteFilterReason, number>> = {};
  const impossibleJumpCount = { value: 0 };
  const sourcePointCount = input.points.length;

  const canonical = canonicalizeTripRouteInputPoints(input.points);
  const rawPoints = canonical.map((p, index) =>
    toMeasuredPoint(
      { latitude: p.latitude, longitude: p.longitude, recordedAt: p.recordedAt },
      p.index,
    ),
  );

  const validPoints: MeasuredRoutePoint[] = [];
  let invalidRemovedCount = 0;
  for (const point of rawPoints) {
    if (!isValidCoordinate(point.latitude, point.longitude)) {
      invalidRemovedCount += 1;
      reasonCounts.invalid_coordinate = (reasonCounts.invalid_coordinate ?? 0) + 1;
      continue;
    }
    validPoints.push(point);
  }

  let working = removeExactDuplicates(validPoints, reasonCounts);
  const afterExactDuplicates = working.length;
  const duplicateRemovedCount = validPoints.length - afterExactDuplicates;

  working = removeNearDuplicates(working, reasonCounts);
  working = processSegments(working, (segment) =>
    removeIsolatedSpikes(segment, reasonCounts, impossibleJumpCount),
  );
  working = processSegments(working, (segment) =>
    reduceStationaryClusters(segment, reasonCounts),
  );

  const beforeSimplify = working.length;
  working = processSegments(working, (segment) =>
    simplifyMeasuredVertices(segment, reasonCounts),
  );
  const simplificationRemovedCount = beforeSimplify - working.length;

  const filteredPoints = working;
  const gaps = detectFilteredGeometryGaps(filteredPoints);
  const largestGapSeconds = gaps.reduce((max, gap) => Math.max(max, gap.gapSeconds), 0);
  const filteredGeometry =
    filteredPoints.length >= 2 ? toGeometry(filteredPoints) : null;
  const quality = filteredGeometry ? 'FILTERED' : 'RAW';
  const fallbackReason =
    quality === 'RAW'
      ? filteredPoints.length === 0
        ? 'no_valid_measured_points'
        : 'insufficient_filtered_points'
      : null;

  const diagnostics = {
    sourcePointCount,
    validPointCount: validPoints.length,
    rawPointCount: rawPoints.length,
    duplicateRemovedCount: Math.max(0, duplicateRemovedCount),
    invalidRemovedCount,
    nearDuplicateRemovedCount: reasonCounts.near_duplicate ?? 0,
    spikeRemovedCount: reasonCounts.isolated_spike ?? 0,
    stationaryReducedCount: reasonCounts.stationary_redundancy ?? 0,
    simplificationRemovedCount,
    impossibleJumpCount: impossibleJumpCount.value,
    gapCount: gaps.length,
    largestGapSeconds,
    filteredPointCount: filteredPoints.length,
    filterReasonCounts: reasonCounts,
    fallbackReason,
    gaps,
    algorithmVersion: TRIP_ROUTE_ALGORITHM_VERSION,
  };

  return {
    rawPoints,
    filteredPoints,
    filteredGeometry,
    quality,
    diagnostics,
  };
}

/** @internal Test helper — verify output contains only measured vertex coordinates. */
export function assertMeasuredVerticesOnly(
  filtered: MeasuredRoutePoint[],
  geometry: TripRouteLngLat[] | null,
): void {
  if (!geometry) return;
  for (const pair of geometry) {
    const match = filtered.some(
      (p) => p.longitude === pair[0] && p.latitude === pair[1],
    );
    if (!match) {
      throw new Error('Geometry contains non-measured coordinate');
    }
  }
}
