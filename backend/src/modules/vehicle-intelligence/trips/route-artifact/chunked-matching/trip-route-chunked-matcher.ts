import type { MapMatchedLeg, MapMatchResult } from '../../mapbox.service';
import { MapboxService } from '../../mapbox.service';
import type { TripRouteLngLat } from '../trip-route-geometry';
import {
  TRIP_ROUTE_CHUNK_MAX_COORDINATES,
  TRIP_ROUTE_MAX_MAPBOX_REQUESTS_PER_TRIP,
  TRIP_ROUTE_TRAJECTORY_RETENTION_MAX,
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
import {
  geometryDistanceMeters,
  stitchChunkGeometries,
} from './trip-route-chunk-stitcher';
import { evaluateRouteMatchQualityGates } from './trip-route-match-quality-gates';
import type {
  MapboxChunkCoordinate,
  MapboxChunkMatchingClient,
  MapboxChunkMatchResponse,
} from './mapbox-chunk-matching.client';

const CHUNK_MAX_RETRIES = 2;
const CHUNK_RETRY_BASE_MS = 250;
const MAX_MATCHED_VERTEX_JUMP_METERS = 500;

export interface ChunkedMatcherRunOptions {
  maxMapboxRequests?: number;
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
): Promise<MapboxChunkMatchResponse> {
  const fingerprint = chunkCoordinateFingerprint(coords);
  const cached = attemptCache.get(fingerprint);
  if (cached) return cached;

  let last: MapboxChunkMatchResponse | null = null;
  for (let attempt = 0; attempt <= CHUNK_MAX_RETRIES; attempt++) {
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

function assertGeometryValid(geometry: TripRouteLngLat[]): string[] {
  const failures: string[] = [];
  if (geometry.length < 2) {
    failures.push('matched_geometry_too_short');
    return failures;
  }
  for (let i = 1; i < geometry.length; i++) {
    const jump = MapboxService.haversineM(
      geometry[i - 1][1],
      geometry[i - 1][0],
      geometry[i][1],
      geometry[i][0],
    );
    if (jump > MAX_MATCHED_VERTEX_JUMP_METERS) {
      failures.push('impossible_matched_jump');
      break;
    }
  }
  return failures;
}

function aggregateLegs(chunks: MapMatchedChunkResult[]): MapMatchedLeg[] {
  const legs: MapMatchedLeg[] = [];
  for (const chunk of chunks) {
    if (chunk.status === 'SUCCESS') {
      legs.push(...chunk.legs);
    }
  }
  return legs;
}

function computeMatchCoverage(chunks: MapMatchedChunkResult[]): number {
  let eligible = 0;
  let covered = 0;
  for (const chunk of chunks) {
    if (chunk.status === 'SKIPPED') continue;
    const weight = Math.max(chunk.sourceDistanceMeters, 1);
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
  const filteredDistanceMeters = sourceDistanceMeters(input.filteredPoints);

  const emptyDiagnostics = (
    status: ChunkedMatchDiagnostics['matchingStatus'],
    failureReason: string | null,
  ): ChunkedMatchDiagnostics => ({
    segmentCount: 0,
    chunkCount: 0,
    failedChunkCount: 0,
    retainedPointCount: 0,
    mapboxRequestCount: 0,
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
  const attemptCache = new Map<string, MapboxChunkMatchResponse>();
  let mapboxRequestCount = 0;
  let retainedPointCount = 0;
  const segmentGeometries: TripRouteLngLat[][] = [];
  const segmentPointCounts: number[] = [];
  let globalMaxSeam = 0;
  const globalSeamFailures: string[] = [];

  for (const segment of segments) {
    if (segment.points.length < 2) continue;

    const retained =
      segment.points.length > TRIP_ROUTE_CHUNK_MAX_COORDINATES
        ? retainTrajectoryPoints(segment.points, TRIP_ROUTE_TRAJECTORY_RETENTION_MAX)
        : segment.points;
    retainedPointCount += retained.length;
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

      if (mapboxRequestCount >= maxRequests) {
        throw new TripRouteMatchRetryableError(
          `Mapbox request cap exceeded (${maxRequests})`,
        );
      }

      const coords = toMapboxCoordinates(slice);
      const response = await matchChunkWithRetries(client, coords, attemptCache);
      mapboxRequestCount += 1;

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
    segmentPointCounts.push(stitch.geometry.length);
    allChunkResults.push(...segmentChunks);
  }

  const stitchedGeometry = segmentGeometries.flat();
  const chunkCount = allChunkResults.length;
  const failedChunkCount = allChunkResults.filter((c) => c.status === 'FAILED').length;
  const matchedDistanceMeters = geometryDistanceMeters(stitchedGeometry);
  const matchCoverage = computeMatchCoverage(allChunkResults);
  const geometryFailures = assertGeometryValid(stitchedGeometry);

  const quality = evaluateRouteMatchQualityGates({
    chunkResults: allChunkResults,
    filteredDistanceMeters,
    matchedDistanceMeters,
    maxSeamDistanceMeters: globalMaxSeam,
    seamFailures: [...globalSeamFailures, ...geometryFailures],
    matchedGeometry: stitchedGeometry,
  });

  const matchedSegmentBoundaries = mapGapsToMatchedBoundaries(input.gaps, segmentPointCounts);

  const diagnostics: ChunkedMatchDiagnostics = {
    segmentCount: segments.length,
    chunkCount,
    failedChunkCount,
    retainedPointCount,
    mapboxRequestCount,
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

  const legs = aggregateLegs(allChunkResults);
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
