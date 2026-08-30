export const FUEL_STATION_RESOLVER_VERSION = 'fuel-station-resolver-v1' as const;

export type FuelStationResolveStatus =
  | 'MATCHED'
  | 'AMBIGUOUS'
  | 'NOT_FOUND'
  | 'INVALID_COORDINATES'
  | 'ERROR';

export type FuelStationMatchConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface FuelStationResolveInput {
  latitude: number;
  longitude: number;
}

export interface FuelStationMatchFeatures {
  insideGeometry: boolean;
  geometryDistanceMeters: number;
  pointDistanceMeters: number;
  isAreaGeometry: boolean;
  metadataCompleteness: number;
  distanceRank: number;
  secondCandidateGapMeters: number | null;
  secondCandidateGapRatio: number | null;
}

export interface FuelStationCandidateStation {
  osmType: string;
  osmId: string;
  name?: string;
  brand?: string;
  operator?: string;
  address?: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
}

export interface FuelStationScoredCandidate {
  station: FuelStationCandidateStation;
  score: number;
  features: FuelStationMatchFeatures;
  datasetVersion: string;
  geometryType: string;
  dedupeGroupId?: string;
}

export interface FuelStationResolveDiagnostics {
  searchRadiusMeters: number;
  usedFallbackRadius: boolean;
  rawCandidateCount: number;
  dedupedCandidateCount: number;
  queryLatencyMs?: number;
  dedupeMergedCount?: number;
  topScore?: number;
  secondScore?: number;
}

export interface FuelStationResolveResult {
  status: FuelStationResolveStatus;
  confidence?: FuelStationMatchConfidence;
  score?: number;
  station?: FuelStationCandidateStation;
  candidates?: FuelStationScoredCandidate[];
  datasetVersion?: string;
  resolverVersion: typeof FUEL_STATION_RESOLVER_VERSION;
  diagnostics?: FuelStationResolveDiagnostics;
  errorMessage?: string;
}

export interface FuelStationRawCandidateRow {
  osm_type: string;
  osm_id: bigint | number;
  name: string | null;
  brand: string | null;
  operator: string | null;
  street: string | null;
  housenumber: string | null;
  postcode: string | null;
  city: string | null;
  dataset_version: string;
  latitude: number;
  longitude: number;
  point_distance_m: number;
  geometry_distance_m: number;
  inside_geometry: boolean;
  geometry_type: string;
}
