import type { MapMatchedLeg, MapMatchResult } from '../../mapbox.service';
import type { TripRouteLngLat } from '../trip-route-geometry';
import type { MeasuredRoutePoint, TripRouteTelemetryGap } from '../trip-route-preprocessing.types';

export type MapMatchedChunkStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';

export type MapboxFailureClass = 'RETRYABLE' | 'NON_RETRYABLE';

export interface RouteMatchCoordinate {
  longitude: number;
  latitude: number;
  timestamp?: string;
  sourceIndex: number;
}

export interface ContinuousRouteSegment {
  segmentIndex: number;
  points: MeasuredRoutePoint[];
  geometry: TripRouteLngLat[];
}

export interface RouteChunkPlan {
  segmentIndex: number;
  chunkIndex: number;
  sourceStartIndex: number;
  sourceEndIndex: number;
}

export interface MapMatchedChunkResult {
  segmentIndex: number;
  chunkIndex: number;
  sourceStartIndex: number;
  sourceEndIndex: number;
  matchedGeometry: TripRouteLngLat[];
  legs: MapMatchedLeg[];
  confidence: number;
  matchedDistanceMeters: number;
  sourceDistanceMeters: number;
  tracepointCoverage: number;
  status: MapMatchedChunkStatus;
  failureReason: string | null;
  failureClass: MapboxFailureClass | null;
}

export interface MatchedSegmentBoundary {
  segmentIndex: number;
  afterMatchedPointIndex: number;
  beforeMatchedPointIndex: number;
  gapSeconds: number;
  continuity: 'UNKNOWN';
}

export interface ChunkedMatchDiagnostics {
  segmentCount: number;
  chunkCount: number;
  failedChunkCount: number;
  retainedPointCount: number;
  mapboxRequestCount: number;
  chunkSuccessRatio: number;
  tracepointCoverage: number;
  weightedMatchConfidence: number;
  distanceRatio: number;
  maxSeamDistanceMeters: number;
  matchedSegmentBoundaries: MatchedSegmentBoundary[];
  qualityGateFailures: string[];
  matchingStatus: 'MATCHED' | 'FILTERED_FALLBACK' | 'SKIPPED' | 'TRANSIENT_FAILURE';
  failureReason: string | null;
}

export interface ChunkedMatchPipelineResult {
  routeQuality: 'MATCHED' | 'FILTERED' | 'RAW';
  matchedGeometry: TripRouteLngLat[] | null;
  matchResult: MapMatchResult | null;
  matchConfidence: number | null;
  matchCoverage: number | null;
  matchedPointCount: number | null;
  chunkCount: number | null;
  failedChunkCount: number | null;
  diagnostics: ChunkedMatchDiagnostics;
}

export interface ChunkedMatchInput {
  filteredPoints: MeasuredRoutePoint[];
  filteredGeometry: TripRouteLngLat[] | null;
  gaps: TripRouteTelemetryGap[];
  preprocessingQuality: 'FILTERED' | 'RAW';
}
