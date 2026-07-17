import { BookingStatus, StationStatus, VehicleStatus } from '@prisma/client';

export const STATION_ARCHIVE_PREVIEW_LIST_LIMIT = 25;

export const StationArchivePreviewIssueCode = {
  PRIMARY_ARCHIVE_REQUIRES_SUCCESSOR: 'PRIMARY_ARCHIVE_REQUIRES_SUCCESSOR',
  SUCCESSOR_PRIMARY_NOT_ACTIVE: 'SUCCESSOR_PRIMARY_NOT_ACTIVE',
  ALREADY_ARCHIVED: 'ALREADY_ARCHIVED',
  HOME_VEHICLES_REMAIN: 'HOME_VEHICLES_REMAIN',
  PRESENT_VEHICLES_REMAIN: 'PRESENT_VEHICLES_REMAIN',
  EXPECTED_VEHICLES_REMAIN: 'EXPECTED_VEHICLES_REMAIN',
  PLANNED_TRANSFERS_REMAIN: 'PLANNED_TRANSFERS_REMAIN',
  FUTURE_PICKUPS_REMAIN: 'FUTURE_PICKUPS_REMAIN',
  FUTURE_RETURNS_REMAIN: 'FUTURE_RETURNS_REMAIN',
  OPEN_HANDOVERS_REMAIN: 'OPEN_HANDOVERS_REMAIN',
  ACTIVE_BOOKINGS_REMAIN: 'ACTIVE_BOOKINGS_REMAIN',
  SCOPED_STAFF_REMAINS: 'SCOPED_STAFF_REMAINS',
  OPEN_TASKS_REMAIN: 'OPEN_TASKS_REMAIN',
  SET_SUCCESSOR_PRIMARY: 'SET_SUCCESSOR_PRIMARY',
  TRANSFER_PRIMARY_BEFORE_ARCHIVE: 'TRANSFER_PRIMARY_BEFORE_ARCHIVE',
  APPLY_ARCHIVED_INVARIANTS: 'APPLY_ARCHIVED_INVARIANTS',
  REVIEW_VEHICLE_LINKS: 'REVIEW_VEHICLE_LINKS',
  REVIEW_BOOKINGS: 'REVIEW_BOOKINGS',
  REVIEW_STAFF_SCOPE: 'REVIEW_STAFF_SCOPE',
} as const;

export type StationArchivePreviewIssueCode =
  (typeof StationArchivePreviewIssueCode)[keyof typeof StationArchivePreviewIssueCode];

export interface StationArchivePreviewIssue {
  code: string;
  message: string;
}

export interface StationArchivePreviewListSection<T> {
  totalCount: number;
  items: T[];
  truncated: boolean;
  limit: number;
}

export interface StationArchivePreviewVehicleItem {
  id: string;
  vehicleName: string | null;
  licensePlate: string | null;
  status: VehicleStatus;
}

export interface StationArchivePreviewBookingItem {
  id: string;
  status: BookingStatus;
  startDate: string;
  endDate: string;
  customerName: string;
  vehicleLabel: string;
}

export interface StationArchivePreviewHandoverItem {
  bookingId: string;
  kind: 'PICKUP' | 'RETURN';
  status: BookingStatus;
  scheduledAt: string;
  customerName: string;
  vehicleLabel: string;
}

export interface StationArchivePreviewStaffItem {
  membershipId: string;
  userId: string;
  name: string;
  role: string;
}

export interface StationArchivePreviewTaskItem {
  id: string;
  title: string;
  status: string;
}

export interface StationArchivePreviewSuccessorCandidate {
  id: string;
  name: string;
  code: string | null;
}

export interface StationArchivePreviewCapabilities {
  pickupEnabled: boolean;
  returnEnabled: boolean;
  afterHoursReturnEnabled: boolean;
  keyBoxAvailable: boolean;
}

export interface StationArchivePreviewAffectedCounts {
  homeVehicles: number;
  presentVehicles: number;
  expectedVehicles: number;
  futurePickupBookings: number;
  futureReturnBookings: number;
  openHandovers: number;
  scopedStaff: number;
  openTasks: number;
  plannedTransfers: number;
  activeBookings: number;
}

export interface StationArchivePreviewSnapshotInput {
  stationId: string;
  organizationId: string;
  status: StationStatus;
  isPrimary: boolean;
  archivedAt: Date | null;
  pickupEnabled: boolean;
  returnEnabled: boolean;
  afterHoursReturnEnabled: boolean;
  keyBoxAvailable: boolean;
  successorCandidates: StationArchivePreviewSuccessorCandidate[];
}

export interface StationArchivePreviewPreflightCounts
  extends StationArchivePreviewAffectedCounts {}

export interface StationArchivePreviewEvaluation {
  archiveAllowed: boolean;
  idempotent: boolean;
  blockingReasons: StationArchivePreviewIssue[];
  warnings: StationArchivePreviewIssue[];
  requiredFollowUpActions: StationArchivePreviewIssue[];
  affectedCounts: StationArchivePreviewAffectedCounts;
}

export interface StationArchivePreviewResult extends StationArchivePreviewEvaluation {
  stationId: string;
  organizationId: string;
  status: StationStatus;
  alreadyArchived: boolean;
  isPrimary: boolean;
  primaryStatus: {
    isPrimary: boolean;
    successorCandidates: StationArchivePreviewSuccessorCandidate[];
  };
  capabilities: StationArchivePreviewCapabilities;
  partial: boolean;
  preview: {
    homeVehicles: StationArchivePreviewListSection<StationArchivePreviewVehicleItem>;
    presentVehicles: StationArchivePreviewListSection<StationArchivePreviewVehicleItem>;
    expectedVehicles: StationArchivePreviewListSection<StationArchivePreviewVehicleItem>;
    futurePickupBookings: StationArchivePreviewListSection<StationArchivePreviewBookingItem>;
    futureReturnBookings: StationArchivePreviewListSection<StationArchivePreviewBookingItem>;
    openHandovers: StationArchivePreviewListSection<StationArchivePreviewHandoverItem>;
    scopedStaff: StationArchivePreviewListSection<StationArchivePreviewStaffItem>;
    openTasks: StationArchivePreviewListSection<StationArchivePreviewTaskItem>;
    plannedTransfers: StationArchivePreviewListSection<StationArchivePreviewVehicleItem>;
  };
}
