import type { RouteQuality } from '@prisma/client';
import type { TripRouteArtifactWriteInput } from './trip-route.types';
import { parseTripRouteGeometryJson } from './trip-route-geometry';

export class TripRouteArtifactValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TripRouteArtifactValidationError';
  }
}

function assertNonNegativeInt(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new TripRouteArtifactValidationError(`${name} must be a non-negative integer`);
  }
}

function assertOptionalNonNegativeInt(name: string, value: number | null | undefined): void {
  if (value == null) return;
  assertNonNegativeInt(name, value);
}

function assertUnitInterval(name: string, value: number | null | undefined): void {
  if (value == null) return;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TripRouteArtifactValidationError(`${name} must be between 0 and 1`);
  }
}

function assertGeometryPresent(
  quality: RouteQuality,
  matched: unknown,
  filtered: unknown,
): void {
  if (quality === 'MATCHED') {
    const geometry = parseTripRouteGeometryJson(matched);
    if (!geometry || geometry.length < 2) {
      throw new TripRouteArtifactValidationError(
        'MATCHED route quality requires matchedGeometry with at least 2 coordinates',
      );
    }
  }

  if (quality === 'FILTERED') {
    const geometry = parseTripRouteGeometryJson(filtered);
    if (!geometry || geometry.length < 2) {
      throw new TripRouteArtifactValidationError(
        'FILTERED route quality requires filteredGeometry with at least 2 coordinates',
      );
    }
  }

  // RAW: no artifact geometry required — VehicleTripWaypoint is canonical measured source.
}

function assertChunkCounts(
  chunkCount: number | null | undefined,
  failedChunkCount: number | null | undefined,
): void {
  assertOptionalNonNegativeInt('chunkCount', chunkCount ?? null);
  assertOptionalNonNegativeInt('failedChunkCount', failedChunkCount ?? null);
  if (
    chunkCount != null &&
    failedChunkCount != null &&
    failedChunkCount > chunkCount
  ) {
    throw new TripRouteArtifactValidationError(
      'failedChunkCount cannot exceed chunkCount',
    );
  }
}

/**
 * Validate route artifact invariants before persistence.
 * Geometry order contract: [longitude, latitude][].
 */
export function validateTripRouteArtifactWrite(input: TripRouteArtifactWriteInput): void {
  if (!input.organizationId?.trim()) {
    throw new TripRouteArtifactValidationError('organizationId is required');
  }
  if (!input.vehicleId?.trim()) {
    throw new TripRouteArtifactValidationError('vehicleId is required');
  }
  if (!input.tripId?.trim()) {
    throw new TripRouteArtifactValidationError('tripId is required');
  }
  if (!input.algorithmVersion?.trim()) {
    throw new TripRouteArtifactValidationError('algorithmVersion is required');
  }
  if (!input.inputFingerprint?.trim()) {
    throw new TripRouteArtifactValidationError('inputFingerprint is required');
  }

  assertNonNegativeInt('sourcePointCount', input.sourcePointCount);
  assertNonNegativeInt('filteredPointCount', input.filteredPointCount ?? 0);
  assertOptionalNonNegativeInt('matchedPointCount', input.matchedPointCount ?? null);
  assertUnitInterval('matchConfidence', input.matchConfidence ?? null);
  assertUnitInterval('matchCoverage', input.matchCoverage ?? null);
  assertChunkCounts(input.chunkCount ?? null, input.failedChunkCount ?? null);

  const matchedJson = input.matchedGeometry
    ? serializeForValidation(input.matchedGeometry)
    : null;
  const filteredJson = input.filteredGeometry
    ? serializeForValidation(input.filteredGeometry)
    : null;

  assertGeometryPresent(input.routeQuality, matchedJson, filteredJson);
}

function serializeForValidation(geometry: TripRouteArtifactWriteInput['matchedGeometry']) {
  return geometry;
}

/**
 * Resolve the canonical stored route quality from a persisted artifact row.
 */
export function resolveStoredRouteQuality(
  routeQuality: RouteQuality,
): RouteQuality {
  return routeQuality;
}
