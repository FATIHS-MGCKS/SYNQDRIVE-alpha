export const VehicleHomeFleetDeltaCommandName = {
  ADD: 'AddVehiclesToHomeStation',
  REMOVE: 'RemoveVehiclesFromHomeStation',
  MOVE: 'MoveVehiclesToHomeStation',
} as const;

export type VehicleHomeFleetDeltaCommandName =
  (typeof VehicleHomeFleetDeltaCommandName)[keyof typeof VehicleHomeFleetDeltaCommandName];

export const VehicleHomeFleetDeltaItemOutcome = {
  APPLIED: 'APPLIED',
  IDEMPOTENT: 'IDEMPOTENT',
  FAILED: 'FAILED',
} as const;

export type VehicleHomeFleetDeltaItemOutcome =
  (typeof VehicleHomeFleetDeltaItemOutcome)[keyof typeof VehicleHomeFleetDeltaItemOutcome];

export const VehicleHomeFleetDeltaIssueCode = {
  VEHICLE_NOT_FOUND: 'VEHICLE_NOT_FOUND',
  VEHICLE_WRONG_ORGANIZATION: 'VEHICLE_WRONG_ORGANIZATION',
  STATION_NOT_FOUND: 'STATION_NOT_FOUND',
  STATION_NOT_ASSIGNABLE: 'STATION_NOT_ASSIGNABLE',
  STATION_ARCHIVED: 'STATION_ARCHIVED',
  STATION_INACTIVE: 'STATION_INACTIVE',
  NOT_AT_SOURCE_STATION: 'NOT_AT_SOURCE_STATION',
  VERSION_CONFLICT: 'STATION_POSITION_VERSION_CONFLICT',
  VEHICLE_RENTED_HOME_CHANGE_WARNING: 'VEHICLE_RENTED_HOME_CHANGE_WARNING',
  TARGET_SAME_AS_SOURCE: 'TARGET_SAME_AS_SOURCE',
} as const;

export interface VehicleHomeFleetDeltaIssue {
  code: string;
  message: string;
}

export interface VehicleHomeFleetDeltaVehicleSnapshot {
  id: string;
  homeStationId: string | null;
  currentStationId: string | null;
  expectedStationId: string | null;
  stationPositionVersion: number;
  status: string;
}

export interface VehicleHomeFleetDeltaItemResult {
  vehicleId: string;
  idempotencyKey: string;
  outcome: VehicleHomeFleetDeltaItemOutcome;
  vehicle: VehicleHomeFleetDeltaVehicleSnapshot | null;
  warnings: VehicleHomeFleetDeltaIssue[];
  error: VehicleHomeFleetDeltaIssue | null;
}

export interface VehicleHomeFleetDeltaBatchResult {
  command: VehicleHomeFleetDeltaCommandName;
  organizationId: string;
  stationId: string;
  targetStationId?: string | null;
  batchIdempotencyKey: string | null;
  summary: {
    requested: number;
    applied: number;
    idempotent: number;
    failed: number;
  };
  results: VehicleHomeFleetDeltaItemResult[];
}
