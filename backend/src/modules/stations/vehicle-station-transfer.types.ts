import type { VehicleStationTransferStatus } from '@prisma/client';

export const VehicleStationTransferCommandName = {
  PLAN: 'PlanVehicleStationTransfer',
  MARK_READY: 'MarkVehicleStationTransferReady',
  START: 'StartVehicleStationTransfer',
  ARRIVE: 'ArriveVehicleStationTransfer',
  CANCEL: 'CancelVehicleStationTransfer',
  MARK_OVERDUE: 'MarkVehicleStationTransferOverdue',
} as const;

export type VehicleStationTransferCommandName =
  (typeof VehicleStationTransferCommandName)[keyof typeof VehicleStationTransferCommandName];

export const VehicleStationTransferCommandOutcome = {
  APPLIED: 'APPLIED',
  IDEMPOTENT: 'IDEMPOTENT',
  BLOCKED: 'BLOCKED',
} as const;

export type VehicleStationTransferCommandOutcome =
  (typeof VehicleStationTransferCommandOutcome)[keyof typeof VehicleStationTransferCommandOutcome];

export const VehicleStationTransferIssueCode = {
  VEHICLE_NOT_FOUND: 'VEHICLE_STATION_TRANSFER_VEHICLE_NOT_FOUND',
  STATION_NOT_FOUND: 'VEHICLE_STATION_TRANSFER_STATION_NOT_FOUND',
  TRANSFER_NOT_FOUND: 'VEHICLE_STATION_TRANSFER_NOT_FOUND',
  ACTIVE_TRANSFER_EXISTS: 'VEHICLE_STATION_TRANSFER_ACTIVE_EXISTS',
  INVALID_TRANSITION: 'VEHICLE_STATION_TRANSFER_INVALID_TRANSITION',
  SAME_FROM_TO_STATION: 'VEHICLE_STATION_TRANSFER_SAME_FROM_TO',
  EXPECTED_POLICY_BLOCKED: 'VEHICLE_STATION_TRANSFER_EXPECTED_POLICY_BLOCKED',
  CLEAR_POLICY_BLOCKED: 'VEHICLE_STATION_TRANSFER_CLEAR_POLICY_BLOCKED',
  STATION_POSITION_VERSION_CONFLICT: 'STATION_POSITION_VERSION_CONFLICT',
  REASON_REQUIRED: 'VEHICLE_STATION_TRANSFER_REASON_REQUIRED',
  CAPACITY_WARNING: 'VEHICLE_STATION_TRANSFER_CAPACITY_WARNING',
  CAPACITY_MANUAL_CONFIRMATION: 'VEHICLE_STATION_TRANSFER_CAPACITY_MANUAL_CONFIRMATION',
  CAPACITY_BLOCKED: 'VEHICLE_STATION_TRANSFER_CAPACITY_BLOCKED',
} as const;

export type VehicleStationTransferIssueCode =
  (typeof VehicleStationTransferIssueCode)[keyof typeof VehicleStationTransferIssueCode];

export interface VehicleStationTransferIssue {
  code: string;
  message: string;
}

export const ACTIVE_VEHICLE_STATION_TRANSFER_STATUSES: VehicleStationTransferStatus[] = [
  'PLANNED',
  'READY',
  'IN_TRANSIT',
  'OVERDUE',
];

export interface VehicleStationTransferRecord {
  id: string;
  organizationId: string;
  vehicleId: string;
  fromStationId: string | null;
  toStationId: string;
  status: VehicleStationTransferStatus;
  plannedAt: Date;
  expectedArrivalAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdByUserId: string | null;
  performedByUserId: string | null;
  reason: string | null;
  sourceBookingId: string | null;
}

export interface VehicleStationTransferVehicleSnapshot {
  id: string;
  homeStationId: string | null;
  currentStationId: string | null;
  expectedStationId: string | null;
  expectedStationSource: string | null;
  stationPositionVersion: number;
}

export interface VehicleStationTransferCommandAudit {
  command: VehicleStationTransferCommandName;
  organizationId: string;
  transferId: string;
  vehicleId: string;
  fromStatus: VehicleStationTransferStatus;
  toStatus: VehicleStationTransferStatus;
  fromStationId: string | null;
  toStationId: string;
  reason: string | null;
  performedAt: string;
  performedByUserId: string | null;
  idempotent: boolean;
  clearedExpected: boolean;
  setExpected: boolean;
  setCurrent: boolean;
}

export interface VehicleStationTransferCommandResult {
  outcome: VehicleStationTransferCommandOutcome;
  command: VehicleStationTransferCommandName;
  allowed: boolean;
  transfer: VehicleStationTransferRecord;
  vehicle: VehicleStationTransferVehicleSnapshot;
  blockingReasons: VehicleStationTransferIssue[];
  warnings: VehicleStationTransferIssue[];
  audit: VehicleStationTransferCommandAudit;
}

export interface PlanVehicleStationTransferInput {
  vehicleId: string;
  fromStationId?: string | null;
  toStationId: string;
  plannedAt?: Date | string;
  expectedArrivalAt?: Date | string | null;
  reason?: string | null;
  sourceBookingId?: string | null;
}

export interface TransitionVehicleStationTransferInput {
  transferId: string;
  targetStatus: VehicleStationTransferStatus;
  reason?: string | null;
  expectedVersion?: number;
  performedAt?: Date | string;
}
