import type { StationStatus, VehicleStatus } from '@prisma/client';

export const HOME_ASSIGNMENT_PREVIEW_MAX_BATCH = 500;

export const HomeAssignmentPreviewAction = {
  ADD: 'ADD',
  REMOVE: 'REMOVE',
  MOVE: 'MOVE',
  UNCHANGED: 'UNCHANGED',
  BLOCKED: 'BLOCKED',
} as const;

export type HomeAssignmentPreviewAction =
  (typeof HomeAssignmentPreviewAction)[keyof typeof HomeAssignmentPreviewAction];

export const HomeAssignmentExecutableCommand = {
  ADD: 'add',
  REMOVE: 'remove',
  MOVE: 'move',
} as const;

export type HomeAssignmentExecutableCommand =
  (typeof HomeAssignmentExecutableCommand)[keyof typeof HomeAssignmentExecutableCommand];

export const HomeAssignmentPreviewIssueCode = {
  VEHICLE_NOT_FOUND: 'VEHICLE_NOT_FOUND',
  STATION_NOT_FOUND: 'STATION_NOT_FOUND',
  STATION_ARCHIVED: 'STATION_ARCHIVED',
  STATION_INACTIVE: 'STATION_INACTIVE',
  NOT_AT_SOURCE_STATION: 'NOT_AT_SOURCE_STATION',
  VEHICLE_RENTED_HOME_CHANGE_WARNING: 'VEHICLE_RENTED_HOME_CHANGE_WARNING',
  ACTIVE_TRANSFER_WARNING: 'ACTIVE_TRANSFER_WARNING',
  DUPLICATE_PROPOSAL: 'DUPLICATE_PROPOSAL',
} as const;

export interface HomeAssignmentPreviewIssue {
  code: string;
  message: string;
}

export interface HomeAssignmentPreviewStationRef {
  id: string;
  name: string;
  status: StationStatus;
}

export interface HomeAssignmentPreviewActiveTransfer {
  fromStationId: string | null;
  toStationId: string;
  fromStationName: string | null;
  toStationName: string;
}

export interface HomeAssignmentPreviewItem {
  vehicleId: string;
  licensePlate: string | null;
  vehicleLabel: string | null;
  rentalStatus: VehicleStatus;
  currentHomeStation: HomeAssignmentPreviewStationRef | null;
  desiredHomeStation: HomeAssignmentPreviewStationRef | null;
  currentPhysicalStation: HomeAssignmentPreviewStationRef | null;
  expectedStation: HomeAssignmentPreviewStationRef | null;
  activeTransfer: HomeAssignmentPreviewActiveTransfer | null;
  action: HomeAssignmentPreviewAction;
  executableCommand: HomeAssignmentExecutableCommand | null;
  moveFromStationId: string | null;
  moveToStationId: string | null;
  conflicts: HomeAssignmentPreviewIssue[];
  warnings: HomeAssignmentPreviewIssue[];
}

export interface HomeAssignmentPreviewSummary {
  requested: number;
  evaluated: number;
  toAdd: number;
  toRemove: number;
  toMove: number;
  unchanged: number;
  blocked: number;
}

export interface HomeAssignmentPreviewBatchMeta {
  limit: number;
  requested: number;
  evaluated: number;
  truncated: boolean;
  duplicateVehicleIdsIgnored: number;
}

export interface HomeAssignmentPreviewResult {
  organizationId: string;
  contextStationId: string;
  contextStationName: string;
  summary: HomeAssignmentPreviewSummary;
  batch: HomeAssignmentPreviewBatchMeta;
  items: HomeAssignmentPreviewItem[];
}

export interface HomeAssignmentPreviewProposal {
  vehicleId: string;
  desiredHomeStationId: string | null;
}

export interface HomeAssignmentPreviewVehicleRow {
  id: string;
  licensePlate: string | null;
  make: string | null;
  model: string | null;
  homeStationId: string | null;
  currentStationId: string | null;
  expectedStationId: string | null;
  status: VehicleStatus;
}
