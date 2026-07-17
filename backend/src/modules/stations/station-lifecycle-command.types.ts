import { StationStatus } from '@prisma/client';

export const StationLifecycleCommandName = {
  ACTIVATE: 'ActivateStation',
  DEACTIVATE: 'DeactivateStation',
} as const;

export type StationLifecycleCommandName =
  (typeof StationLifecycleCommandName)[keyof typeof StationLifecycleCommandName];

export const StationLifecycleCommandOutcome = {
  APPLIED: 'APPLIED',
  IDEMPOTENT: 'IDEMPOTENT',
  BLOCKED: 'BLOCKED',
} as const;

export type StationLifecycleCommandOutcome =
  (typeof StationLifecycleCommandOutcome)[keyof typeof StationLifecycleCommandOutcome];

export const StationLifecycleCommandIssueCode = {
  FUTURE_PICKUPS_BLOCK_DEACTIVATE: 'FUTURE_PICKUPS_BLOCK_DEACTIVATE',
  FUTURE_RETURNS_BLOCK_DEACTIVATE: 'FUTURE_RETURNS_BLOCK_DEACTIVATE',
  PRIMARY_REMAINS_WHILE_INACTIVE: 'PRIMARY_REMAINS_WHILE_INACTIVE',
  CAPABILITIES_UNCHANGED_ON_ACTIVATE: 'CAPABILITIES_UNCHANGED_ON_ACTIVATE',
} as const;

export type StationLifecycleCommandIssueCode =
  (typeof StationLifecycleCommandIssueCode)[keyof typeof StationLifecycleCommandIssueCode];

export interface StationLifecycleCommandIssue {
  code: string;
  message: string;
}

export interface StationLifecycleCommandAuditData {
  command: StationLifecycleCommandName;
  stationId: string;
  organizationId: string;
  previousStatus: StationStatus;
  nextStatus: StationStatus;
  performedAt: string;
  idempotent: boolean;
  futurePickupCount?: number;
  futureReturnCount?: number;
}

export interface StationLifecycleCommandResult<TStation = unknown> {
  outcome: StationLifecycleCommandOutcome;
  command: StationLifecycleCommandName;
  station: TStation;
  allowed: boolean;
  blockingReasons: StationLifecycleCommandIssue[];
  warnings: StationLifecycleCommandIssue[];
  requiredActions: StationLifecycleCommandIssue[];
  audit: StationLifecycleCommandAuditData;
}

export interface StationDeactivatePreflightCounts {
  futurePickupCount: number;
  futureReturnCount: number;
}
