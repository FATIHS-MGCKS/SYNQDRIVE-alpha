import { Prisma, StationStatus } from '@prisma/client';
import type { StationArchivedCapabilitiesSnapshot } from './station-archive-command.types';

export const StationRestorePreviewIssueCode = {
  NOT_ARCHIVED: 'NOT_ARCHIVED',
  ALREADY_ACTIVE: 'ALREADY_ACTIVE',
  MISSING_OPENING_HOURS: 'MISSING_OPENING_HOURS',
  INVALID_OR_OUTDATED_OPENING_HOURS: 'INVALID_OR_OUTDATED_OPENING_HOURS',
  WAS_PRIMARY_NOT_RESTORED: 'WAS_PRIMARY_NOT_RESTORED',
  SCOPED_STAFF_NOT_AUTO_REACTIVATED: 'SCOPED_STAFF_NOT_AUTO_REACTIVATED',
  CONFIRM_CAPABILITIES_REQUIRED: 'CONFIRM_CAPABILITIES_REQUIRED',
  VEHICLE_LINKS_UNCHANGED: 'VEHICLE_LINKS_UNCHANGED',
  HISTORICAL_BOOKINGS_UNCHANGED: 'HISTORICAL_BOOKINGS_UNCHANGED',
} as const;

export type StationRestorePreviewIssueCode =
  (typeof StationRestorePreviewIssueCode)[keyof typeof StationRestorePreviewIssueCode];

export interface StationRestorePreviewIssue {
  code: string;
  message: string;
}

export interface StationRestoreSuggestedCapabilities {
  pickupEnabled: boolean;
  returnEnabled: boolean;
  afterHoursReturnEnabled: boolean;
  keyBoxAvailable: boolean;
  source: 'archived_snapshot' | 'current_station';
}

export interface StationRestorePreviewAffectedCounts {
  homeVehicles: number;
  presentVehicles: number;
  expectedVehicles: number;
  historicalBookings: number;
  scopedStaff: number;
}

export interface StationRestorePreviewEvaluation {
  restoreAllowed: boolean;
  idempotent: boolean;
  blockingReasons: StationRestorePreviewIssue[];
  warnings: StationRestorePreviewIssue[];
  requiredFollowUpActions: StationRestorePreviewIssue[];
  affectedCounts: StationRestorePreviewAffectedCounts;
  suggestedCapabilities: StationRestoreSuggestedCapabilities;
  wasPrimary: boolean;
  archivedCapabilitiesSnapshot: StationArchivedCapabilitiesSnapshot | null;
}

export interface StationRestorePreviewResult extends StationRestorePreviewEvaluation {
  stationId: string;
  organizationId: string;
  status: StationStatus;
  alreadyActive: boolean;
  openingHours: Prisma.JsonValue | null;
}
