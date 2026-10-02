export const CHARGING_STATION_RESOLVER_VERSION = 'charging-station-resolver-v1' as const;

export type ChargingStationResolveStatus =
  | 'MATCHED'
  | 'AMBIGUOUS'
  | 'NOT_FOUND'
  | 'INVALID_COORDINATES'
  | 'ERROR';

export type ChargingStationMatchConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ChargingStationResolveInput {
  latitude: number;
  longitude: number;
}

export interface ChargingStationConnectorSummary {
  type: string;
  count?: number;
  maxOutputKw?: number;
}

export interface ChargingStationMatchFeatures {
  insideGeometry: boolean;
  geometryDistanceMeters: number;
  pointDistanceMeters: number;
  isAreaGeometry: boolean;
  metadataCompleteness: number;
  distanceRank: number;
  secondCandidateGapMeters: number | null;
  secondCandidateGapRatio: number | null;
}

export interface ChargingStationCandidateStation {
  osmType: string;
  osmId: string;
  name?: string;
  brand?: string;
  operator?: string;
  network?: string;
  address?: string;
  latitude: number;
  longitude: number;
  geometryDistanceMeters: number;
  pointDistanceMeters?: number;
  access?: string;
  fee?: string;
  capacity?: string;
  connectors?: ChargingStationConnectorSummary[];
  stationMaxOutputKw?: number;
}

export interface ChargingStationScoredCandidate {
  station: ChargingStationCandidateStation;
  score: number;
  features: ChargingStationMatchFeatures;
  datasetVersion: string;
  geometryType: string;
  dedupeGroupId?: string;
}

export interface ChargingStationResolveDiagnostics {
  searchRadiusMeters: number;
  usedFallbackRadius: boolean;
  rawCandidateCount: number;
  dedupedCandidateCount: number;
  queryLatencyMs?: number;
  dedupeMergedCount?: number;
  topScore?: number;
  secondScore?: number;
  topDistance?: number;
  secondDistance?: number;
}

export interface ChargingStationResolveResult {
  status: ChargingStationResolveStatus;
  confidence?: ChargingStationMatchConfidence;
  score?: number;
  station?: ChargingStationCandidateStation;
  candidates?: ChargingStationScoredCandidate[];
  datasetVersion?: string;
  resolverVersion: typeof CHARGING_STATION_RESOLVER_VERSION;
  diagnostics?: ChargingStationResolveDiagnostics;
  errorMessage?: string;
}

export interface ChargingStationRawCandidateRow {
  osm_type: string;
  osm_id: bigint | number;
  name: string | null;
  brand: string | null;
  operator: string | null;
  network: string | null;
  street: string | null;
  housenumber: string | null;
  postcode: string | null;
  city: string | null;
  access: string | null;
  fee: string | null;
  capacity: string | null;
  dataset_version: string;
  latitude: number;
  longitude: number;
  point_distance_m: number;
  geometry_distance_m: number;
  inside_geometry: boolean;
  geometry_type: string;
  tags: Record<string, string> | null;
}
