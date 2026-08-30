import type { FuelStationRawCandidateRow, FuelStationScoredCandidate } from '../fuel-station-location.types';

export function buildRawCandidate(
  overrides: Partial<FuelStationRawCandidateRow> = {},
): FuelStationRawCandidateRow {
  return {
    osm_type: 'node',
    osm_id: 1,
    name: 'Aral',
    brand: 'Aral',
    operator: null,
    street: 'Hauptstraße',
    housenumber: '1',
    postcode: '34117',
    city: 'Kassel',
    dataset_version: 'geofabrik-germany-test',
    latitude: 51.3127,
    longitude: 9.4797,
    point_distance_m: 20,
    geometry_distance_m: 20,
    inside_geometry: false,
    geometry_type: 'POINT',
    ...overrides,
  };
}

export function buildScoredCandidate(
  overrides: {
    score?: number;
    geometryType?: string;
    datasetVersion?: string;
    dedupeGroupId?: string;
    station?: Partial<FuelStationScoredCandidate['station']>;
    features?: Partial<FuelStationScoredCandidate['features']>;
  } = {},
): FuelStationScoredCandidate {
  const station = {
    osmType: 'node',
    osmId: '1',
    name: 'Aral',
    brand: 'Aral',
    latitude: 51.3127,
    longitude: 9.4797,
    distanceMeters: 20,
    ...overrides.station,
  };

  return {
    station,
    score: overrides.score ?? 80,
    datasetVersion: overrides.datasetVersion ?? 'geofabrik-germany-test',
    geometryType: overrides.geometryType ?? 'POINT',
    features: {
      insideGeometry: false,
      geometryDistanceMeters: 20,
      pointDistanceMeters: 20,
      isAreaGeometry: false,
      metadataCompleteness: 0.8,
      distanceRank: 1,
      secondCandidateGapMeters: null,
      secondCandidateGapRatio: null,
      ...overrides.features,
    },
    dedupeGroupId: overrides.dedupeGroupId,
  };
}
