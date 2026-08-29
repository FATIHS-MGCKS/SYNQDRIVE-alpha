import type { RouteQuality } from '@prisma/client';
import type { TripRouteLngLat } from './trip-route-geometry';
import type { TripRouteInputPoint } from './trip-route.types';

/** Internal measured observation with stable source index for auditability. */
export interface MeasuredRoutePoint {
  latitude: number;
  longitude: number;
  recordedAt: string;
  sourceIndex: number;
}

export type TripRouteFilterReason =
  | 'invalid_coordinate'
  | 'exact_duplicate'
  | 'near_duplicate'
  | 'isolated_spike'
  | 'stationary_redundancy'
  | 'simplification';

export interface TripRouteTelemetryGap {
  /** Index in final filtered geometry (inclusive endpoint before gap). */
  afterFilteredPointIndex: number;
  /** Index in final filtered geometry (inclusive endpoint after gap). */
  beforeFilteredPointIndex: number;
  gapSeconds: number;
  /** Measured continuity between endpoints is unknown — do not infer travel. */
  continuity: 'UNKNOWN';
}

export interface TripRoutePreprocessingDiagnostics {
  sourcePointCount: number;
  validPointCount: number;
  rawPointCount: number;
  duplicateRemovedCount: number;
  invalidRemovedCount: number;
  nearDuplicateRemovedCount: number;
  spikeRemovedCount: number;
  stationaryReducedCount: number;
  simplificationRemovedCount: number;
  impossibleJumpCount: number;
  gapCount: number;
  largestGapSeconds: number;
  filteredPointCount: number;
  filterReasonCounts: Partial<Record<TripRouteFilterReason, number>>;
  fallbackReason: string | null;
  gaps: TripRouteTelemetryGap[];
  algorithmVersion: string;
}

export interface TripRoutePreprocessingResult {
  rawPoints: MeasuredRoutePoint[];
  filteredPoints: MeasuredRoutePoint[];
  filteredGeometry: TripRouteLngLat[] | null;
  quality: Extract<RouteQuality, 'FILTERED' | 'RAW'>;
  diagnostics: TripRoutePreprocessingDiagnostics;
}

export type TripRoutePreprocessorInput = {
  tripId: string;
  points: TripRouteInputPoint[];
};
