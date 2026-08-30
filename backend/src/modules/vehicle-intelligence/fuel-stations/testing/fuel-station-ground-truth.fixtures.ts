export interface FuelStationGroundTruthCase {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  scenario:
    | 'urban'
    | 'rural'
    | 'motorway'
    | 'polygon_interior'
    | 'dense_cluster'
    | 'kassel_reference';
  expectedStatus?: 'MATCHED' | 'AMBIGUOUS' | 'NOT_FOUND';
  expectedBrandContains?: string;
}

/** Public OSM-derived probe coordinates — no private vehicle/refuel histories. */
export const FUEL_STATION_GROUND_TRUTH_CASES: FuelStationGroundTruthCase[] = [
  {
    id: 'kassel-center',
    label: 'Kassel center reference (may be >250m from nearest station)',
    latitude: 51.3127,
    longitude: 9.4797,
    scenario: 'kassel_reference',
  },
  {
    id: 'berlin-brandenburg',
    label: 'Berlin Brandenburg Gate area',
    latitude: 52.52,
    longitude: 13.405,
    scenario: 'urban',
    expectedStatus: 'MATCHED',
  },
  {
    id: 'munich-center',
    label: 'Munich center',
    latitude: 48.1351,
    longitude: 11.582,
    scenario: 'urban',
    expectedStatus: 'MATCHED',
  },
  {
    id: 'hamburg-center',
    label: 'Hamburg center',
    latitude: 53.5511,
    longitude: 9.9937,
    scenario: 'urban',
    expectedStatus: 'MATCHED',
  },
  {
    id: 'frankfurt-center',
    label: 'Frankfurt center',
    latitude: 50.1109,
    longitude: 8.6821,
    scenario: 'urban',
    expectedStatus: 'MATCHED',
  },
  {
    id: 'rural-eifel',
    label: 'Rural Eifel probe',
    latitude: 50.35,
    longitude: 6.95,
    scenario: 'rural',
  },
  {
    id: 'north-sea-empty',
    label: 'North Sea empty ocean probe',
    latitude: 54.9,
    longitude: 6.2,
    scenario: 'rural',
    expectedStatus: 'NOT_FOUND',
  },
];
