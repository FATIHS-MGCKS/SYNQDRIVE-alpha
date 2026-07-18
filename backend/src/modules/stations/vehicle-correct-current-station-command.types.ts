import type { VehicleStationPositionSource, VehicleStatus } from '@prisma/client';

export const VehicleCorrectCurrentStationCommandName = {
  CORRECT_CURRENT_STATION: 'CorrectVehicleCurrentStation',
} as const;

export type VehicleCorrectCurrentStationCommandName =
  (typeof VehicleCorrectCurrentStationCommandName)[keyof typeof VehicleCorrectCurrentStationCommandName];

export const VehicleCorrectCurrentStationCommandOutcome = {
  APPLIED: 'APPLIED',
  IDEMPOTENT: 'IDEMPOTENT',
  BLOCKED: 'BLOCKED',
} as const;

export type VehicleCorrectCurrentStationCommandOutcome =
  (typeof VehicleCorrectCurrentStationCommandOutcome)[keyof typeof VehicleCorrectCurrentStationCommandOutcome];

export const VehicleCorrectCurrentStationCommandIssueCode = {
  VEHICLE_RENTED_CURRENT_CORRECTION_WARNING: 'VEHICLE_RENTED_CURRENT_CORRECTION_WARNING',
  STATION_POSITION_VERSION_CONFLICT: 'STATION_POSITION_VERSION_CONFLICT',
  TARGET_STATION_ARCHIVED: 'TARGET_STATION_ARCHIVED',
  TARGET_STATION_INACTIVE: 'TARGET_STATION_INACTIVE',
  INVALID_SOURCE: 'INVALID_SOURCE',
} as const;

export type VehicleCorrectCurrentStationCommandIssueCode =
  (typeof VehicleCorrectCurrentStationCommandIssueCode)[keyof typeof VehicleCorrectCurrentStationCommandIssueCode];

export interface VehicleCorrectCurrentStationCommandIssue {
  code: string;
  message: string;
}

export interface VehicleCorrectCurrentStationCommandAuditData {
  command: VehicleCorrectCurrentStationCommandName;
  organizationId: string;
  vehicleId: string;
  fromCurrentStationId: string | null;
  toCurrentStationId: string | null;
  source: VehicleStationPositionSource;
  previousStationPositionVersion: number;
  nextStationPositionVersion: number;
  reason: string;
  performedAt: string;
  performedByUserId: string | null;
  idempotent: boolean;
}

export interface VehicleCorrectCurrentStationVehicleSnapshot {
  id: string;
  homeStationId: string | null;
  currentStationId: string | null;
  expectedStationId: string | null;
  currentStationSource: VehicleStationPositionSource | null;
  currentStationConfirmedAt: string | null;
  stationPositionVersion: number;
  status: VehicleStatus;
}

export interface VehicleCorrectCurrentStationCommandResult {
  outcome: VehicleCorrectCurrentStationCommandOutcome;
  command: VehicleCorrectCurrentStationCommandName;
  vehicle: VehicleCorrectCurrentStationVehicleSnapshot;
  allowed: boolean;
  blockingReasons: VehicleCorrectCurrentStationCommandIssue[];
  warnings: VehicleCorrectCurrentStationCommandIssue[];
  audit: VehicleCorrectCurrentStationCommandAuditData;
}

export interface VehicleCorrectCurrentStationCommandEvaluation {
  outcome: VehicleCorrectCurrentStationCommandOutcome;
  allowed: boolean;
  idempotent: boolean;
  blockingReasons: VehicleCorrectCurrentStationCommandIssue[];
  warnings: VehicleCorrectCurrentStationCommandIssue[];
}
