import type { TripRouteTelemetryGap } from './trip-route-preprocessing.types';
import type { TripRouteLngLat } from './trip-route-geometry';
import { TRIP_ROUTE_GAP_THRESHOLD_SECONDS } from './trip-route-preprocessing.constants';
import {
  detectWaypointGapBoundaries,
  splitWaypointGeometryByTimestamps,
} from './trip-route-segment-geometry';

export interface PersistedRouteDiagnostics {
  gaps?: TripRouteTelemetryGap[];
  gapCount?: number;
}

/**
 * Authoritative gap count for continuity metadata.
 * Persisted diagnostics win; runtime timestamp derivation is compatibility-only.
 */
export function resolvePersistedGapCount(diagnostics: PersistedRouteDiagnostics): number | null {
  if (Array.isArray(diagnostics.gaps) && diagnostics.gaps.length > 0) {
    return diagnostics.gaps.length;
  }
  if (typeof diagnostics.gapCount === 'number' && diagnostics.gapCount > 0) {
    return diagnostics.gapCount;
  }
  return null;
}

/**
 * RAW / measured-speed segmentation must never apply filtered-geometry gap indices to
 * waypoint arrays. Use persisted timestamp threshold semantics only.
 */
export function splitMeasuredPointsByGapAuthority(input: {
  geometry: TripRouteLngLat[];
  timestamps: string[];
  diagnostics: PersistedRouteDiagnostics;
  gapThresholdSeconds?: number;
}): {
  segments: TripRouteLngLat[][];
  gapCount: number;
  gapAuthority: 'persisted' | 'runtime';
} {
  const threshold = input.gapThresholdSeconds ?? TRIP_ROUTE_GAP_THRESHOLD_SECONDS;
  const persistedGapCount = resolvePersistedGapCount(input.diagnostics);

  const segments = splitWaypointGeometryByTimestamps(
    input.geometry,
    input.timestamps,
    threshold,
  );

  if (persistedGapCount != null) {
    return {
      segments,
      gapCount: persistedGapCount,
      gapAuthority: 'persisted',
    };
  }

  const runtimeBoundaries = detectWaypointGapBoundaries(input.timestamps, threshold);
  return {
    segments,
    gapCount: runtimeBoundaries.length,
    gapAuthority: 'runtime',
  };
}

export function splitSpeedPointIndicesByGapAuthority(
  timestamps: string[],
  diagnostics: PersistedRouteDiagnostics,
  gapThresholdSeconds = TRIP_ROUTE_GAP_THRESHOLD_SECONDS,
): number[][] {
  if (timestamps.length === 0) return [];
  const boundaries = detectWaypointGapBoundaries(timestamps, gapThresholdSeconds);
  if (boundaries.length === 0) {
    return [Array.from({ length: timestamps.length }, (_, index) => index)];
  }

  const segments: number[][] = [];
  let start = 0;
  for (const boundary of boundaries) {
    const endExclusive = boundary.afterIndex + 1;
    if (endExclusive > start) {
      segments.push(Array.from({ length: endExclusive - start }, (_, offset) => start + offset));
    }
    start = boundary.beforeIndex;
  }
  if (start < timestamps.length) {
    segments.push(Array.from({ length: timestamps.length - start }, (_, offset) => start + offset));
  }
  return segments.filter((segment) => segment.length >= 2);
}
