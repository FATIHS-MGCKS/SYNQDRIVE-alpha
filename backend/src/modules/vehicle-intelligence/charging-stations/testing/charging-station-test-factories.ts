import type {
  ChargingStationRawCandidateRow,
  ChargingStationScoredCandidate,
} from '../charging-station-location.types';

export function buildRawCandidate(
  overrides: Partial<ChargingStationRawCandidateRow> = {},
): ChargingStationRawCandidateRow {
  return {
    osm_type: 'node',
    osm_id: 1,
    name: 'ChargePoint Alpha',
    brand: 'EnBW',
    operator: 'EnBW mobility+',
    network: 'EnBW',
    street: 'Ladeallee',
    housenumber: '1',
    postcode: '34117',
    city: 'Kassel',
    access: 'yes',
    fee: 'no',
    capacity: '4',
    dataset_version: 'synthetic-e6-2-test',
    latitude: 50.001,
    longitude: 8.001,
    point_distance_m: 20,
    geometry_distance_m: 20,
    inside_geometry: false,
    geometry_type: 'POINT',
    tags: { amenity: 'charging_station', 'socket:type2': '4' },
    ...overrides,
  };
}

export function buildScoredCandidate(
  overrides: {
    score?: number;
    geometryType?: string;
    datasetVersion?: string;
    dedupeGroupId?: string;
    station?: Partial<ChargingStationScoredCandidate['station']>;
    features?: Partial<ChargingStationScoredCandidate['features']>;
  } = {},
): ChargingStationScoredCandidate {
  const station = {
    osmType: 'node',
    osmId: '1',
    name: 'ChargePoint Alpha',
    brand: 'EnBW',
    latitude: 50.001,
    longitude: 8.001,
    geometryDistanceMeters: 20,
    pointDistanceMeters: 20,
    ...overrides.station,
  };

  return {
    station,
    score: overrides.score ?? 80,
    datasetVersion: overrides.datasetVersion ?? 'synthetic-e6-2-test',
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
