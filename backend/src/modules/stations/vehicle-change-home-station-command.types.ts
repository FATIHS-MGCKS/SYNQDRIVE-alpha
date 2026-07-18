import type { VehicleStatus } from '@prisma/client';

export const VehicleChangeHomeStationCommandName = {
  CHANGE_HOME_STATION: 'ChangeVehicleHomeStation',
} as const;

export type VehicleChangeHomeStationCommandName =
  (typeof VehicleChangeHomeStationCommandName)[keyof typeof VehicleChangeHomeStationCommandName];

export const VehicleChangeHomeStationCommandOutcome = {
  APPLIED: 'APPLIED',
  IDEMPOTENT: 'IDEMPOTENT',
  BLOCKED: 'BLOCKED',
} as const;

export type VehicleChangeHomeStationCommandOutcome =
  (typeof VehicleChangeHomeStationCommandOutcome)[keyof typeof VehicleChangeHomeStationCommandOutcome];

export const VehicleChangeHomeStationCommandIssueCode = {
  VEHICLE_RENTED_HOME_CHANGE_WARNING: 'VEHICLE_RENTED_HOME_CHANGE_WARNING',
  STATION_POSITION_VERSION_CONFLICT: 'STATION_POSITION_VERSION_CONFLICT',
  TARGET_STATION_ARCHIVED: 'TARGET_STATION_ARCHIVED',
  TARGET_STATION_INACTIVE: 'TARGET_STATION_INACTIVE',
} as const;

export type VehicleChangeHomeStationCommandIssueCode =
  (typeof VehicleChangeHomeStationCommandIssueCode)[keyof typeof VehicleChangeHomeStationCommandIssueCode];

export interface VehicleChangeHomeStationCommandIssue {
  code: string;
  message: string;
}

export interface VehicleChangeHomeStationCommandAuditData {
  command: VehicleChangeHomeStationCommandName;
  organizationId: string;
  vehicleId: string;
  fromHomeStationId: string | null;
  toHomeStationId: string | null;
  previousStationPositionVersion: number;
  nextStationPositionVersion: number;
  reason: string | null;
  performedAt: string;
  performedByUserId: string | null;
  idempotent: boolean;
}

export interface VehicleChangeHomeStationVehicleSnapshot {
  id: string;
  homeStationId: string | null;
  currentStationId: string | null;
  expectedStationId: string | null;
  stationPositionVersion: number;
  status: VehicleStatus;
}

export interface VehicleChangeHomeStationCommandResult {
  outcome: VehicleChangeHomeStationCommandOutcome;
  command: VehicleChangeHomeStationCommandName;
  vehicle: VehicleChangeHomeStationVehicleSnapshot;
  allowed: boolean;
  blockingReasons: VehicleChangeHomeStationCommandIssue[];
  warnings: VehicleChangeHomeStationCommandIssue[];
  audit: VehicleChangeHomeStationCommandAuditData;
}

export interface VehicleChangeHomeStationCommandEvaluation {
  outcome: VehicleChangeHomeStationCommandOutcome;
  allowed: boolean;
  idempotent: boolean;
  blockingReasons: VehicleChangeHomeStationCommandIssue[];
  warnings: VehicleChangeHomeStationCommandIssue[];
}
