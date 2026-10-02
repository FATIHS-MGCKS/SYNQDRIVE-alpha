import {
  deriveStationMaxOutputKw,
  summarizeConnectorsFromTags,
} from './charging-station-connector-summary';
import { formatChargingStationAddress, metadataCompletenessScore } from './charging-station-address.util';
import type {
  ChargingStationRawCandidateRow,
  ChargingStationResolveDiagnostics,
  ChargingStationScoredCandidate,
} from './charging-station-location.types';
import {
  computeCandidateBaseScore,
  enrichCandidateFeatures,
  isAreaGeometryType,
} from './charging-station-match-scorer';

export function mapRawCandidateToScored(
  row: ChargingStationRawCandidateRow,
  rank: number,
  second?: ChargingStationRawCandidateRow,
): ChargingStationScoredCandidate {
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

  const tags = row.tags ?? null;
  const connectors = summarizeConnectorsFromTags(tags);
  const stationMaxOutputKw = deriveStationMaxOutputKw(connectors, tags);

  return {
    station: {
      osmType: row.osm_type,
      osmId: String(row.osm_id),
      name: row.name ?? undefined,
      brand: row.brand ?? undefined,
      operator: row.operator ?? undefined,
      network: row.network ?? undefined,
      address: formatChargingStationAddress(row),
      latitude: row.latitude,
      longitude: row.longitude,
      geometryDistanceMeters: row.geometry_distance_m,
      pointDistanceMeters: row.point_distance_m,
      access: row.access ?? undefined,
      fee: row.fee ?? undefined,
      capacity: row.capacity ?? undefined,
      connectors: connectors.length > 0 ? connectors : undefined,
      stationMaxOutputKw,
    },
    score: baseScore,
    features,
    datasetVersion: row.dataset_version,
    geometryType: row.geometry_type,
  };
}

export function scoreChargingStationCandidates(
  rows: ChargingStationRawCandidateRow[],
): ChargingStationScoredCandidate[] {
  return rows.map((row, index) => mapRawCandidateToScored(row, index + 1, rows[index + 1]));
}

export function buildResolveDiagnostics(input: {
  searchRadiusMeters: number;
  usedFallbackRadius: boolean;
  rawCandidateCount: number;
  dedupedCandidateCount: number;
  queryLatencyMs: number;
  dedupeMergedCount: number;
}): ChargingStationResolveDiagnostics {
  return {
    searchRadiusMeters: input.searchRadiusMeters,
    usedFallbackRadius: input.usedFallbackRadius,
    rawCandidateCount: input.rawCandidateCount,
    dedupedCandidateCount: input.dedupedCandidateCount,
    queryLatencyMs: input.queryLatencyMs,
    dedupeMergedCount: input.dedupeMergedCount,
  };
}
