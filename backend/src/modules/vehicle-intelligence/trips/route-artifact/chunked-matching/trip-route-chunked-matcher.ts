import type { MapMatchedLeg, MapMatchResult } from '../../mapbox.service';
import type { TripRouteLngLat } from '../trip-route-geometry';
import {
  TRIP_ROUTE_CHUNK_MAX_COORDINATES,
  TRIP_ROUTE_MAX_MAPBOX_REQUESTS_PER_TRIP,
} from './trip-route-chunked-matching.constants';
import type {
  ChunkedMatchDiagnostics,
  ChunkedMatchInput,
  ChunkedMatchPipelineResult,
  MapMatchedChunkResult,
} from './trip-route-chunked-matching.types';
import { TripRouteMatchRetryableError } from './trip-route-chunked-matching.errors';
import { planRouteChunks } from './trip-route-chunk-planner';
import { splitFilteredPointsByGaps, mapGapsToMatchedBoundaries } from './trip-route-gap-segments';
import { retainTrajectoryPoints, sourceDistanceMeters } from './trip-route-trajectory-retention';
import { stitchChunkGeometries } from './trip-route-chunk-stitcher';
import { evaluateRouteMatchQualityGates } from './trip-route-match-quality-gates';
import {
  aggregateRouteLegsWithoutOverlap,
  effectiveChunkSourceDistance,
} from './trip-route-overlap-leg-aggregator';
import {
  assertGeometryValidPerSegment,
  filteredDistanceAcrossSegments,
  flattenSegmentGeometries,
  matchedDistanceAcrossSegments,
  segmentPointCounts,
} from './trip-route-segment-metrics';
import type {
  MapboxChunkCoordinate,
  MapboxChunkMatchingClient,
  MapboxChunkMatchResponse,
} from './mapbox-chunk-matching.client';
import { TRIP_ROUTE_CHUNK_OVERLAP_COORDINATES } from './trip-route-chunked-matching.constants';

const CHUNK_MAX_RETRIES = 2;
const CHUNK_RETRY_BASE_MS = 250;

export interface ChunkedMatcherRunOptions {
  maxMapboxRequests?: number;
}

interface MapboxRequestBudget {
  max: number;
  attempts: number;
  retries: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkCoordinateFingerprint(coords: MapboxChunkCoordinate[]): string {
  return coords
    .map((c) => `${c.longitude},${c.latitude},${c.timestamp ?? ''}`)
    .join('|');
}

function toMapboxCoordinates(
  points: { longitude: number; latitude: number; recordedAt: string }[],
): MapboxChunkCoordinate[] {
  return points.map((p) => ({
    longitude: p.longitude,
    latitude: p.latitude,
    timestamp: p.recordedAt,
  }));
}

function buildFailedChunk(
  plan: { segmentIndex: number; chunkIndex: number; sourceStartIndex: number; sourceEndIndex: number },
  segmentPoints: { longitude: number; latitude: number; recordedAt: string }[],
  reason: string,
  failureClass: 'RETRYABLE' | 'NON_RETRYABLE',
): MapMatchedChunkResult {
  const slice = segmentPoints.slice(plan.sourceStartIndex, plan.sourceEndIndex);
  return {
    segmentIndex: plan.segmentIndex,
    chunkIndex: plan.chunkIndex,
    sourceStartIndex: plan.sourceStartIndex,
    sourceEndIndex: plan.sourceEndIndex,
    matchedGeometry: [],
    legs: [],
    confidence: 0,
    matchedDistanceMeters: 0,
    sourceDistanceMeters: sourceDistanceMeters(slice as any),
    tracepointCoverage: 0,
    status: 'FAILED',
    failureReason: reason,
    failureClass,
  };
}

async function matchChunkWithRetries(
  client: MapboxChunkMatchingClient,
  coords: MapboxChunkCoordinate[],
  attemptCache: Map<string, MapboxChunkMatchResponse>,
  budget: MapboxRequestBudget,
): Promise<MapboxChunkMatchResponse> {
  const fingerprint = chunkCoordinateFingerprint(coords);
  const cached = attemptCache.get(fingerprint);
  if (cached) return cached;

  let last: MapboxChunkMatchResponse | null = null;
  for (let attempt = 0; attempt <= CHUNK_MAX_RETRIES; attempt++) {
    if (budget.attempts >= budget.max) {
      throw new TripRouteMatchRetryableError(
        `Mapbox request cap exceeded (${budget.max})`,
      );
    }

    budget.attempts += 1;
    if (attempt > 0) budget.retries += 1;

    last = await client.matchChunk(coords);
    if (last.ok || last.failureClass === 'NON_RETRYABLE') {
      attemptCache.set(fingerprint, last);
      return last;
    }
    if (attempt < CHUNK_MAX_RETRIES) {
      await sleep(CHUNK_RETRY_BASE_MS * 2 ** attempt);
    }
  }

  const response = last ?? {
    ok: false,
    failureReason: 'unknown_chunk_failure',
    failureClass: 'RETRYABLE' as const,
  };
  attemptCache.set(fingerprint, response);
  return response;
}

function computeMatchCoverage(chunks: MapMatchedChunkResult[]): number {
  let eligible = 0;
  let covered = 0;

  for (const chunk of chunks) {
    if (chunk.status === 'SKIPPED') continue;
    const priorInSegment = chunks.some(
      (other) =>
        other.segmentIndex === chunk.segmentIndex &&
        other.chunkIndex < chunk.chunkIndex &&
        other.status !== 'SKIPPED',
    );
    const weight = effectiveChunkSourceDistance(
      chunk,
      TRIP_ROUTE_CHUNK_OVERLAP_COORDINATES,
      !priorInSegment,
    );
    eligible += weight;
    if (chunk.status === 'SUCCESS') {
      covered += weight * chunk.tracepointCoverage;
    }
  }

  return eligible > 0 ? covered / eligible : 0;
}

/**
 * R3 canonical chunked map-matching pipeline (pure orchestration).
 */
export async function runChunkedMatchPipeline(
  input: ChunkedMatchInput,
  client: MapboxChunkMatchingClient,
  options: ChunkedMatcherRunOptions = {},
): Promise<ChunkedMatchPipelineResult> {
  const maxRequests = options.maxMapboxRequests ?? TRIP_ROUTE_MAX_MAPBOX_REQUESTS_PER_TRIP;

  const emptyDiagnostics = (
    status: ChunkedMatchDiagnostics['matchingStatus'],
    failureReason: string | null,
  ): ChunkedMatchDiagnostics => ({
    segmentCount: 0,
    chunkCount: 0,
    failedChunkCount: 0,
    retainedPointCount: 0,
    mapboxRequestCount: 0,
    mapboxRequestAttemptCount: 0,
    retryCount: 0,
    chunkSuccessRatio: 0,
    tracepointCoverage: 0,
    weightedMatchConfidence: 0,
    distanceRatio: 0,
    maxSeamDistanceMeters: 0,
    matchedSegmentBoundaries: [],
    qualityGateFailures: [],
    matchingStatus: status,
    failureReason,
  });

  if (input.preprocessingQuality === 'RAW' || input.filteredPoints.length < 2) {
    return {
      routeQuality: input.preprocessingQuality,
      matchedGeometry: null,
      matchResult: null,
      matchConfidence: null,
      matchCoverage: null,
      matchedPointCount: null,
      chunkCount: null,
      failedChunkCount: null,
      diagnostics: emptyDiagnostics('SKIPPED', 'insufficient_filtered_points'),
    };
  }

  const segments = splitFilteredPointsByGaps(input.filteredPoints, input.gaps);
  const allChunkResults: MapMatchedChunkResult[] = [];
  const chunksBySegment: MapMatchedChunkResult[][] = [];
  const attemptCache = new Map<string, MapboxChunkMatchResponse>();
  const budget: MapboxRequestBudget = { max: maxRequests, attempts: 0, retries: 0 };
  let mapboxRequestCount = 0;
  let retainedPointCount = 0;
  const segmentGeometries: TripRouteLngLat[][] = [];
  let filteredEligibleDistanceMeters = 0;
  let globalMaxSeam = 0;
  const globalSeamFailures: string[] = [];

  for (const segment of segments) {
    if (segment.points.length < 2) continue;

    const retained = retainTrajectoryPoints(segment.points);
    retainedPointCount += retained.length;
    filteredEligibleDistanceMeters += sourceDistanceMeters(retained);
    const plans = planRouteChunks(retained.length, segment.segmentIndex);
    const segmentChunks: MapMatchedChunkResult[] = [];

    for (const plan of plans) {
      const slice = retained.slice(plan.sourceStartIndex, plan.sourceEndIndex);
      if (slice.length < 2) {
        segmentChunks.push(
          buildFailedChunk(plan, retained, 'chunk_too_short', 'NON_RETRYABLE'),
        );
        continue;
      }

      mapboxRequestCount += 1;
      const coords = toMapboxCoordinates(slice);
      const response = await matchChunkWithRetries(client, coords, attemptCache, budget);

      if (!response.ok) {
        if (response.failureClass === 'RETRYABLE') {
          throw new TripRouteMatchRetryableError(response.failureReason);
        }
        segmentChunks.push(
          buildFailedChunk(plan, retained, response.failureReason, 'NON_RETRYABLE'),
        );
        continue;
      }

      segmentChunks.push({
        segmentIndex: plan.segmentIndex,
        chunkIndex: plan.chunkIndex,
        sourceStartIndex: plan.sourceStartIndex,
        sourceEndIndex: plan.sourceEndIndex,
        matchedGeometry: response.matchedGeometry,
        legs: response.legs,
        confidence: response.confidence,
        matchedDistanceMeters: response.matchedDistanceMeters,
        sourceDistanceMeters: sourceDistanceMeters(slice),
        tracepointCoverage: response.tracepointCoverage,
        status: 'SUCCESS',
        failureReason: null,
        failureClass: null,
      });
    }

    const stitch = stitchChunkGeometries(segmentChunks);
    globalMaxSeam = Math.max(globalMaxSeam, stitch.maxSeamDistanceMeters);
    globalSeamFailures.push(...stitch.seamFailures);
    segmentGeometries.push(stitch.geometry);
    chunksBySegment.push(segmentChunks);
    allChunkResults.push(...segmentChunks);
  }

  const stitchedGeometry = flattenSegmentGeometries(segmentGeometries);
  const chunkCount = allChunkResults.length;
  const failedChunkCount = allChunkResults.filter((c) => c.status === 'FAILED').length;
  const matchedDistanceMeters = matchedDistanceAcrossSegments(segmentGeometries);
  const matchCoverage = computeMatchCoverage(allChunkResults);
  const geometryFailures = assertGeometryValidPerSegment(segmentGeometries);
  const validSegmentCount = segmentGeometries.filter((geometry) => geometry.length >= 2).length;

  const quality = evaluateRouteMatchQualityGates({
    chunkResults: allChunkResults,
    filteredDistanceMeters: filteredEligibleDistanceMeters,
    matchedDistanceMeters,
    maxSeamDistanceMeters: globalMaxSeam,
    seamFailures: globalSeamFailures,
    geometryFailures,
    validSegmentCount,
  });

  const matchedSegmentBoundaries = mapGapsToMatchedBoundaries(
    input.gaps,
    segmentPointCounts(segmentGeometries),
  );

  const diagnostics: ChunkedMatchDiagnostics = {
    segmentCount: segments.length,
    chunkCount,
    failedChunkCount,
    retainedPointCount,
    mapboxRequestCount,
    mapboxRequestAttemptCount: budget.attempts,
    retryCount: budget.retries,
    chunkSuccessRatio: quality.chunkSuccessRatio,
    tracepointCoverage: quality.tracepointCoverage,
    weightedMatchConfidence: quality.weightedMatchConfidence,
    distanceRatio: quality.distanceRatio,
    maxSeamDistanceMeters: globalMaxSeam,
    matchedSegmentBoundaries,
    qualityGateFailures: quality.failures,
    matchingStatus: quality.passed ? 'MATCHED' : 'FILTERED_FALLBACK',
    failureReason: quality.passed ? null : quality.failures.join(','),
  };

  if (!quality.passed) {
    return {
      routeQuality: 'FILTERED',
      matchedGeometry: null,
      matchResult: null,
      matchConfidence: null,
      matchCoverage: null,
      matchedPointCount: null,
      chunkCount,
      failedChunkCount,
      diagnostics,
    };
  }

  const legs = aggregateRouteLegsWithoutOverlap(chunksBySegment);
  const matchResult: MapMatchResult = {
    matchedGeometry: stitchedGeometry as [number, number][],
    legs,
    totalDistance: matchedDistanceMeters,
    confidence: quality.weightedMatchConfidence,
    tracepointCoverage: matchCoverage,
  };

  return {
    routeQuality: 'MATCHED',
    matchedGeometry: stitchedGeometry,
    matchResult,
    matchConfidence: quality.weightedMatchConfidence,
    matchCoverage,
    matchedPointCount: stitchedGeometry.length,
    chunkCount,
    failedChunkCount: 0,
    diagnostics,
  };
}
