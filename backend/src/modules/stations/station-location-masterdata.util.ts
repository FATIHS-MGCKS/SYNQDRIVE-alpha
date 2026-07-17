import { BadRequestException } from '@nestjs/common';
import { StationCoordinatesSource } from '@prisma/client';

export const STATION_GEOFENCE_RADIUS_MIN_M = 25;
export const STATION_GEOFENCE_RADIUS_MAX_M = 5000;
export const MAPBOX_FORWARD_GEOCODE_RELEVANCE_MIN = 0.5;

/** Mapbox Search Box match types we refuse to auto-apply as station coordinates. */
export const MAPBOX_SEARCHBOX_REJECTED_MATCH_TYPES = new Set([
  'low',
  'fallback',
  'approximate',
]);

export const StationLocationValidationCode = {
  GEOFENCE_RADIUS_OUT_OF_RANGE: 'STATION_GEOFENCE_RADIUS_OUT_OF_RANGE',
  GEOFENCE_RADIUS_INVALID: 'STATION_GEOFENCE_RADIUS_INVALID',
} as const;

export type StationLocationValidationCode =
  (typeof StationLocationValidationCode)[keyof typeof StationLocationValidationCode];

export function stationHasMissingCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): boolean {
  return latitude == null || longitude == null;
}

export function isAcceptableMapboxForwardGeocodeRelevance(relevance: number | undefined): boolean {
  if (relevance === undefined) return true;
  if (typeof relevance !== 'number' || !Number.isFinite(relevance)) return false;
  return relevance >= MAPBOX_FORWARD_GEOCODE_RELEVANCE_MIN;
}

export function isAcceptableMapboxSearchboxMatchType(matchType: string | undefined): boolean {
  if (matchType === undefined || matchType === '') return true;
  return !MAPBOX_SEARCHBOX_REJECTED_MATCH_TYPES.has(matchType.toLowerCase());
}

export function assertValidGeofenceRadius(radiusMeters: number | null | undefined): void {
  if (radiusMeters === undefined || radiusMeters === null) return;
  if (typeof radiusMeters !== 'number' || !Number.isFinite(radiusMeters)) {
    throw new BadRequestException({
      message: 'radiusMeters must be a finite number or null',
      code: StationLocationValidationCode.GEOFENCE_RADIUS_INVALID,
    });
  }
  const rounded = Math.round(radiusMeters);
  if (rounded < STATION_GEOFENCE_RADIUS_MIN_M || rounded > STATION_GEOFENCE_RADIUS_MAX_M) {
    throw new BadRequestException({
      message: `radiusMeters must be between ${STATION_GEOFENCE_RADIUS_MIN_M} and ${STATION_GEOFENCE_RADIUS_MAX_M} meters`,
      code: StationLocationValidationCode.GEOFENCE_RADIUS_OUT_OF_RANGE,
    });
  }
}

export function normalizeGeofenceRadius(radiusMeters: number): number {
  assertValidGeofenceRadius(radiusMeters);
  return Math.round(radiusMeters);
}

export interface StationCoordinatesProvenanceInput {
  explicitCoordinates?: boolean;
  geocodedCoordinates?: boolean;
  mapboxRetrieve?: boolean;
  coordinatesCleared?: boolean;
}

export function resolveStationCoordinatesProvenance(
  input: StationCoordinatesProvenanceInput,
): {
  coordinatesSource: StationCoordinatesSource | null;
  coordinatesConfirmedAt: Date | null;
} {
  if (input.coordinatesCleared) {
    return { coordinatesSource: null, coordinatesConfirmedAt: null };
  }
  if (input.explicitCoordinates) {
    return {
      coordinatesSource: StationCoordinatesSource.MANUAL,
      coordinatesConfirmedAt: new Date(),
    };
  }
  if (input.mapboxRetrieve) {
    return {
      coordinatesSource: StationCoordinatesSource.MAPBOX_RETRIEVE,
      coordinatesConfirmedAt: null,
    };
  }
  if (input.geocodedCoordinates) {
    return {
      coordinatesSource: StationCoordinatesSource.FORWARD_GEOCODE,
      coordinatesConfirmedAt: null,
    };
  }
  return { coordinatesSource: null, coordinatesConfirmedAt: null };
}
