import type { RouteQuality } from '@prisma/client';
import type { TripRouteLngLat } from './trip-route-geometry';

export const ROUTE_PROCESSING_STATES = [
  'READY',
  'PROCESSING',
  'RETRYING',
  'FAILED',
  'UNAVAILABLE',
] as const;

export type RouteProcessingState = (typeof ROUTE_PROCESSING_STATES)[number];

export const ROUTE_CONTINUITY_STATUSES = [
  'COMPLETE',
  'GAPS_PRESENT',
  'INSUFFICIENT_DATA',
] as const;

export type RouteContinuityStatus = (typeof ROUTE_CONTINUITY_STATUSES)[number];

export interface CanonicalTripRouteSpeedPoint {
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  timestamp: string;
}

export interface CanonicalTripRouteGeometry {
  type: 'MultiLineString';
  coordinates: TripRouteLngLat[][];
}

export interface CanonicalTripRouteResponse {
  tripId: string;
  vehicleId: string;
  routeQuality: RouteQuality | null;
  geometry: CanonicalTripRouteGeometry | null;
  source: {
    provider: string | null;
    algorithmVersion: string | null;
    processedAt: string | null;
  };
  quality: {
    matchConfidence: number | null;
    matchCoverage: number | null;
  };
  counts: {
    sourcePointCount: number;
    filteredPointCount: number;
    matchedPointCount: number | null;
  };
  continuity: {
    status: RouteContinuityStatus;
    hasUnknownGaps: boolean;
    gapCount: number;
  };
  status: {
    processingState: RouteProcessingState;
    ready: boolean;
    retryableFailure: boolean;
    failureReason: string | null;
  };
  /** Measured speed overlay source — independent of matched geometry vertices. */
  speedPoints: CanonicalTripRouteSpeedPoint[];
  /**
   * @deprecated Removed from API payload in R4 — use `speedPoints` (measured telemetry only).
   * Not route geometry.
   */
  points?: CanonicalTripRouteSpeedPoint[];
}
