import { StationStatus } from '@prisma/client';
import type { StationRestorePreviewEvaluation } from './station-restore-preview.types';

export const StationRestoreCommandName = {
  RESTORE: 'RestoreStation',
} as const;

export type StationRestoreCommandName =
  (typeof StationRestoreCommandName)[keyof typeof StationRestoreCommandName];

export const StationRestoreCommandOutcome = {
  APPLIED: 'APPLIED',
  IDEMPOTENT: 'IDEMPOTENT',
  BLOCKED: 'BLOCKED',
} as const;

export type StationRestoreCommandOutcome =
  (typeof StationRestoreCommandOutcome)[keyof typeof StationRestoreCommandOutcome];

export const StationRestoreCommandIssueCode = {
  CAPABILITIES_CONFIRMATION_REQUIRED: 'CAPABILITIES_CONFIRMATION_REQUIRED',
  AFTER_HOURS_WITHOUT_RETURN: 'AFTER_HOURS_WITHOUT_RETURN',
} as const;

export type StationRestoreCommandIssueCode =
  (typeof StationRestoreCommandIssueCode)[keyof typeof StationRestoreCommandIssueCode];

export interface StationRestoreCommandIssue {
  code: string;
  message: string;
}

export interface StationRestoreCommandOptions {
  pickupEnabled: boolean;
  returnEnabled: boolean;
  afterHoursReturnEnabled?: boolean;
  keyBoxAvailable?: boolean;
}

export interface StationRestoreCommandAuditData {
  command: StationRestoreCommandName;
  stationId: string;
  organizationId: string;
  previousStatus: StationStatus;
  nextStatus: StationStatus;
  performedAt: string;
  performedByUserId: string | null;
  idempotent: boolean;
  appliedCapabilities: StationRestoreCommandOptions;
  suggestedCapabilities: StationRestorePreviewEvaluation['suggestedCapabilities'];
}

export interface StationRestoreCommandEvaluation {
  outcome: StationRestoreCommandOutcome;
  allowed: boolean;
  idempotent: boolean;
  blockingReasons: StationRestoreCommandIssue[];
  warnings: StationRestoreCommandIssue[];
  requiredActions: StationRestoreCommandIssue[];
}

export interface StationRestoreCommandResult<TStation = unknown> {
  outcome: StationRestoreCommandOutcome;
  command: StationRestoreCommandName;
  station: TStation;
  allowed: boolean;
  blockingReasons: StationRestoreCommandIssue[];
  warnings: StationRestoreCommandIssue[];
  requiredActions: StationRestoreCommandIssue[];
  audit: StationRestoreCommandAuditData;
}

export interface EvaluateStationRestoreCommandInput {
  preview: StationRestorePreviewEvaluation;
  options: StationRestoreCommandOptions;
  stationStatus: StationStatus;
}
