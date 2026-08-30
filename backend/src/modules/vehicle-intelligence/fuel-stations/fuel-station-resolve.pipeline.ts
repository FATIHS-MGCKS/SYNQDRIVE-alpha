import { formatFuelStationAddress, metadataCompletenessScore } from './fuel-station-address.util';
import {
  FALLBACK_SEARCH_RADIUS_METERS,
  MAX_CANDIDATES,
  PRIMARY_SEARCH_RADIUS_METERS,
} from './fuel-station-location.constants';
import {
  FUEL_STATION_RESOLVER_VERSION,
  type FuelStationRawCandidateRow,
  type FuelStationResolveDiagnostics,
  type FuelStationResolveInput,
  type FuelStationScoredCandidate,
} from './fuel-station-location.types';
import {
  computeCandidateBaseScore,
  enrichCandidateFeatures,
  isAreaGeometryType,
} from './fuel-station-match-scorer';

export function mapRawCandidateToScored(
  row: FuelStationRawCandidateRow,
  rank: number,
  second?: FuelStationRawCandidateRow,
): FuelStationScoredCandidate {
  const metadataCompleteness = metadataCompletenessScore(row);
  const isAreaGeometry = isAreaGeometryType(row.geometry_type);
  const baseScore = computeCandidateBaseScore({
    insideGeometry: row.inside_geometry,
    geometryDistanceMeters: row.geometry_distance_m,
    pointDistanceMeters: row.point_distance_m,
    isAreaGeometry,
    metadataCompleteness,
  });

  const features = enrichCandidateFeatures(
    {
      insideGeometry: row.inside_geometry,
      geometryDistanceMeters: row.geometry_distance_m,
      pointDistanceMeters: row.point_distance_m,
      isAreaGeometry,
      metadataCompleteness,
    },
    rank,
    second
      ? {
          geometryDistanceMeters: second.geometry_distance_m,
        }
      : null,
  );

  return {
    station: {
      osmType: row.osm_type,
      osmId: String(row.osm_id),
      name: row.name ?? undefined,
      brand: row.brand ?? undefined,
      operator: row.operator ?? undefined,
      address: formatFuelStationAddress(row),
      latitude: row.latitude,
      longitude: row.longitude,
      distanceMeters: row.geometry_distance_m,
    },
    score: baseScore,
    features,
    datasetVersion: row.dataset_version,
    geometryType: row.geometry_type,
  };
}

export function scoreFuelStationCandidates(rows: FuelStationRawCandidateRow[]): FuelStationScoredCandidate[] {
  return rows.map((row, index) => mapRawCandidateToScored(row, index + 1, rows[index + 1]));
}

export function buildResolveDiagnostics(input: {
  searchRadiusMeters: number;
  usedFallbackRadius: boolean;
  rawCandidateCount: number;
  dedupedCandidateCount: number;
  queryLatencyMs: number;
  dedupeMergedCount: number;
}): FuelStationResolveDiagnostics {
  return {
    searchRadiusMeters: input.searchRadiusMeters,
    usedFallbackRadius: input.usedFallbackRadius,
    rawCandidateCount: input.rawCandidateCount,
    dedupedCandidateCount: input.dedupedCandidateCount,
    queryLatencyMs: input.queryLatencyMs,
    dedupeMergedCount: input.dedupeMergedCount,
  };
}

export const DEFAULT_RESOLVER_RADII = {
  primary: PRIMARY_SEARCH_RADIUS_METERS,
  fallback: FALLBACK_SEARCH_RADIUS_METERS,
  maxCandidates: MAX_CANDIDATES,
  resolverVersion: FUEL_STATION_RESOLVER_VERSION,
};

export type FuelStationResolvePipelineInput = FuelStationResolveInput;
