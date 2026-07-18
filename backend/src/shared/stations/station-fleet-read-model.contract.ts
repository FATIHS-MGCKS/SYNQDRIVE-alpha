export const STATION_FLEET_READ_MODEL_VERSION = 1 as const;

export const STATION_FLEET_DEFAULT_PAGE_SIZE = 25 as const;
export const STATION_FLEET_MAX_PAGE_SIZE = 100 as const;

export const StationFleetGroupKey = {
  ON_SITE: 'on_site',
  HOME_FLEET_AWAY: 'home_fleet_away',
  FOREIGN_ON_SITE: 'foreign_on_site',
  EXPECTED: 'expected',
  CURRENTLY_RENTED: 'currently_rented',
} as const;

export type StationFleetGroupKey =
  (typeof StationFleetGroupKey)[keyof typeof StationFleetGroupKey];

export const STATION_FLEET_GROUP_ORDER: readonly StationFleetGroupKey[] = [
  StationFleetGroupKey.ON_SITE,
  StationFleetGroupKey.HOME_FLEET_AWAY,
  StationFleetGroupKey.FOREIGN_ON_SITE,
  StationFleetGroupKey.EXPECTED,
  StationFleetGroupKey.CURRENTLY_RENTED,
];

export interface StationFleetStationRef {
  id: string;
  name: string;
  code: string | null;
}

export interface StationFleetNextAction {
  code: string;
  label: string;
  deepLink: string | null;
}

export interface StationFleetVehicleRow {
  id: string;
  licensePlate: string | null;
  make: string;
  model: string;
  vehicleName: string | null;
  runtimeState: string;
  runtimeStateLabel: string;
  homeStation: StationFleetStationRef | null;
  currentStation: StationFleetStationRef | null;
  expectedStation: StationFleetStationRef | null;
  positionSource: string | null;
  lastConfirmationAt: string | null;
  nextAction: StationFleetNextAction | null;
  group: StationFleetGroupKey;
}

export interface StationFleetGroupSection {
  key: StationFleetGroupKey;
  total: number;
  vehicles: StationFleetVehicleRow[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export interface StationFleetReadModel {
  version: typeof STATION_FLEET_READ_MODEL_VERSION;
  stationId: string;
  organizationId: string;
  evaluatedAt: string;
  search: string | null;
  groupFilter: StationFleetGroupKey | null;
  groups: StationFleetGroupSection[];
  scope: {
    applied: boolean;
    mode: 'ALL_STATIONS' | 'SCOPED_STATIONS';
  };
  frontendRecomputation: false;
}

export interface StationFleetContractMetadata {
  version: typeof STATION_FLEET_READ_MODEL_VERSION;
  resolver: 'station-fleet-read-model.resolver';
  groups: readonly StationFleetGroupKey[];
  defaultPageSize: number;
  maxPageSize: number;
  frontendRecomputation: false;
}

export function getStationFleetContractMetadata(): StationFleetContractMetadata {
  return {
    version: STATION_FLEET_READ_MODEL_VERSION,
    resolver: 'station-fleet-read-model.resolver',
    groups: STATION_FLEET_GROUP_ORDER,
    defaultPageSize: STATION_FLEET_DEFAULT_PAGE_SIZE,
    maxPageSize: STATION_FLEET_MAX_PAGE_SIZE,
    frontendRecomputation: false,
  };
}
