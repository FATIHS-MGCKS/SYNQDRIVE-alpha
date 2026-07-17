import { StationStatus } from '@prisma/client';
import type { StationArchivePreviewEvaluation } from './station-archive-preview.types';

export const StationArchiveCommandName = {
  ARCHIVE: 'ArchiveStation',
} as const;

export type StationArchiveCommandName =
  (typeof StationArchiveCommandName)[keyof typeof StationArchiveCommandName];

export const StationArchiveCommandOutcome = {
  APPLIED: 'APPLIED',
  IDEMPOTENT: 'IDEMPOTENT',
  BLOCKED: 'BLOCKED',
} as const;

export type StationArchiveCommandOutcome =
  (typeof StationArchiveCommandOutcome)[keyof typeof StationArchiveCommandOutcome];

export const StationArchiveCommandIssueCode = {
  FUTURE_PICKUPS_BLOCK_ARCHIVE: 'FUTURE_PICKUPS_BLOCK_ARCHIVE',
  FUTURE_RETURNS_BLOCK_ARCHIVE: 'FUTURE_RETURNS_BLOCK_ARCHIVE',
  FUTURE_BOOKINGS_ACKNOWLEDGEMENT_REQUIRED: 'FUTURE_BOOKINGS_ACKNOWLEDGEMENT_REQUIRED',
  PRIMARY_ARCHIVE_REQUIRES_SUCCESSOR: 'PRIMARY_ARCHIVE_REQUIRES_SUCCESSOR',
  SUCCESSOR_PRIMARY_NOT_ACTIVE: 'SUCCESSOR_PRIMARY_NOT_ACTIVE',
  SUCCESSOR_PRIMARY_IS_SELF: 'SUCCESSOR_PRIMARY_IS_SELF',
  ACKNOWLEDGED_FUTURE_BOOKINGS: 'ACKNOWLEDGED_FUTURE_BOOKINGS',
} as const;

export type StationArchiveCommandIssueCode =
  (typeof StationArchiveCommandIssueCode)[keyof typeof StationArchiveCommandIssueCode];

export interface StationArchiveCommandIssue {
  code: string;
  message: string;
}

export interface StationArchiveCommandOptions {
  successorPrimaryStationId?: string | null;
  acknowledgeFutureBookings?: boolean;
  reason?: string | null;
}

export interface StationArchivedCapabilitiesSnapshot {
  pickupEnabled: boolean;
  returnEnabled: boolean;
  afterHoursReturnEnabled: boolean;
  keyBoxAvailable: boolean;
  isPrimary: boolean;
  archivedAt: string;
  archivedByUserId: string | null;
  reason?: string | null;
}

export interface StationArchiveCommandAuditData {
  command: StationArchiveCommandName;
  stationId: string;
  organizationId: string;
  previousStatus: StationStatus;
  nextStatus: StationStatus;
  performedAt: string;
  performedByUserId: string | null;
  idempotent: boolean;
  successorPrimaryStationId?: string | null;
  acknowledgedFutureBookings?: boolean;
  archivedCapabilitiesSnapshot?: StationArchivedCapabilitiesSnapshot;
  futurePickupCount?: number;
  futureReturnCount?: number;
}

export interface StationArchiveCommandEvaluation {
  outcome: StationArchiveCommandOutcome;
  allowed: boolean;
  idempotent: boolean;
  blockingReasons: StationArchiveCommandIssue[];
  warnings: StationArchiveCommandIssue[];
  requiredActions: StationArchiveCommandIssue[];
}

export interface StationArchiveCommandResult<TStation = unknown> {
  outcome: StationArchiveCommandOutcome;
  command: StationArchiveCommandName;
  station: TStation;
  allowed: boolean;
  blockingReasons: StationArchiveCommandIssue[];
  warnings: StationArchiveCommandIssue[];
  requiredActions: StationArchiveCommandIssue[];
  audit: StationArchiveCommandAuditData;
}

export interface EvaluateStationArchiveCommandInput {
  preview: StationArchivePreviewEvaluation;
  options: StationArchiveCommandOptions;
  station: {
    id: string;
    status: StationStatus;
    isPrimary: boolean;
  };
  successorPrimaryStationStatus?: StationStatus | null;
}
