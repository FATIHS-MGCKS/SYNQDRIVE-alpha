import {
  TRIP_ROUTE_MATCH_MAX_DISTANCE_RATIO,
  TRIP_ROUTE_MATCH_MIN_CONFIDENCE,
  TRIP_ROUTE_MATCH_MIN_COVERAGE,
  TRIP_ROUTE_MATCH_MIN_DISTANCE_RATIO,
  TRIP_ROUTE_SEAM_MAX_DISTANCE_METERS,
} from './trip-route-chunked-matching.constants';
import type { MapMatchedChunkResult } from './trip-route-chunked-matching.types';

export interface RouteMatchQualityInput {
  chunkResults: MapMatchedChunkResult[];
  filteredDistanceMeters: number;
  matchedDistanceMeters: number;
  maxSeamDistanceMeters: number;
  seamFailures: string[];
  matchedGeometry: import('../trip-route-geometry').TripRouteLngLat[];
}

export interface RouteMatchQualityEvaluation {
  passed: boolean;
  failures: string[];
  chunkSuccessRatio: number;
  tracepointCoverage: number;
  weightedMatchConfidence: number;
  distanceRatio: number;
}

export function aggregateChunkMetrics(
  chunks: MapMatchedChunkResult[],
): Pick<
  RouteMatchQualityEvaluation,
  'chunkSuccessRatio' | 'tracepointCoverage' | 'weightedMatchConfidence'
> {
  const required = chunks.filter((c) => c.status !== 'SKIPPED');
  if (required.length === 0) {
    return { chunkSuccessRatio: 0, tracepointCoverage: 0, weightedMatchConfidence: 0 };
  }

  const successful = required.filter((c) => c.status === 'SUCCESS');
  const chunkSuccessRatio = successful.length / required.length;

  let weightSum = 0;
  let coverageSum = 0;
  let confidenceSum = 0;

  for (const chunk of successful) {
    const weight = Math.max(chunk.sourceDistanceMeters, 1);
    weightSum += weight;
    coverageSum += chunk.tracepointCoverage * weight;
    confidenceSum += chunk.confidence * weight;
  }

  return {
    chunkSuccessRatio,
    tracepointCoverage: weightSum > 0 ? coverageSum / weightSum : 0,
    weightedMatchConfidence: weightSum > 0 ? confidenceSum / weightSum : 0,
  };
}

export function evaluateRouteMatchQualityGates(
  input: RouteMatchQualityInput,
): RouteMatchQualityEvaluation {
  const metrics = aggregateChunkMetrics(input.chunkResults);
  const failures: string[] = [];

  if (metrics.chunkSuccessRatio < 1) {
    failures.push('chunk_success_ratio_below_1');
  }
  if (metrics.tracepointCoverage < TRIP_ROUTE_MATCH_MIN_COVERAGE) {
    failures.push('tracepoint_coverage_below_threshold');
  }
  if (metrics.weightedMatchConfidence < TRIP_ROUTE_MATCH_MIN_CONFIDENCE) {
    failures.push('match_confidence_below_threshold');
  }

  const distanceRatio =
    input.filteredDistanceMeters > 0
      ? input.matchedDistanceMeters / input.filteredDistanceMeters
      : 0;

  if (
    input.filteredDistanceMeters > 0 &&
    (distanceRatio < TRIP_ROUTE_MATCH_MIN_DISTANCE_RATIO ||
      distanceRatio > TRIP_ROUTE_MATCH_MAX_DISTANCE_RATIO)
  ) {
    failures.push('distance_ratio_out_of_bounds');
  }

  if (input.maxSeamDistanceMeters > TRIP_ROUTE_SEAM_MAX_DISTANCE_METERS) {
    failures.push('seam_distance_exceeded');
  }

  if (!input.matchedGeometry || input.matchedGeometry.length < 2) {
    failures.push('matched_geometry_invalid');
  }

  failures.push(...input.seamFailures);

  return {
    passed: failures.length === 0,
    failures,
    ...metrics,
    distanceRatio,
  };
}
