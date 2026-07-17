import { StationStatus } from '@prisma/client';

export const StationSetPrimaryCommandName = {
  SET_PRIMARY: 'SetPrimaryStation',
} as const;

export type StationSetPrimaryCommandName =
  (typeof StationSetPrimaryCommandName)[keyof typeof StationSetPrimaryCommandName];

export const StationSetPrimaryCommandOutcome = {
  APPLIED: 'APPLIED',
  IDEMPOTENT: 'IDEMPOTENT',
  BLOCKED: 'BLOCKED',
} as const;

export type StationSetPrimaryCommandOutcome =
  (typeof StationSetPrimaryCommandOutcome)[keyof typeof StationSetPrimaryCommandOutcome];

export const StationSetPrimaryCommandIssueCode = {
  PRIMARY_CONFLICT: 'PRIMARY_CONFLICT',
} as const;

export type StationSetPrimaryCommandIssueCode =
  (typeof StationSetPrimaryCommandIssueCode)[keyof typeof StationSetPrimaryCommandIssueCode];

export interface StationSetPrimaryCommandIssue {
  code: string;
  message: string;
}

export interface StationSetPrimaryCommandAuditData {
  command: StationSetPrimaryCommandName;
  stationId: string;
  organizationId: string;
  previousIsPrimary: boolean;
  nextIsPrimary: boolean;
  previousStatus: StationStatus;
  nextStatus: StationStatus;
  performedAt: string;
  performedByUserId: string | null;
  idempotent: boolean;
  demotedPrimaryStationIds: string[];
}

export interface StationSetPrimaryCommandResult<TStation = unknown> {
  outcome: StationSetPrimaryCommandOutcome;
  command: StationSetPrimaryCommandName;
  station: TStation;
  allowed: boolean;
  blockingReasons: StationSetPrimaryCommandIssue[];
  warnings: StationSetPrimaryCommandIssue[];
  requiredActions: StationSetPrimaryCommandIssue[];
  audit: StationSetPrimaryCommandAuditData;
}

export interface StationSetPrimaryPreflightSnapshot {
  stationId: string;
  organizationId: string;
  status: StationStatus;
  isPrimary: boolean;
  nonArchivedPrimaryCount: number;
  otherPrimaryStationIds: string[];
}

export interface StationSetPrimaryCommandEvaluation {
  outcome: StationSetPrimaryCommandOutcome;
  allowed: boolean;
  idempotent: boolean;
  blockingReasons: StationSetPrimaryCommandIssue[];
  warnings: StationSetPrimaryCommandIssue[];
  requiredActions: StationSetPrimaryCommandIssue[];
}
