import { StationStatus } from '@prisma/client';

export const StationLifecycleCommand = {
  CREATE: 'CREATE',
  UPDATE_MASTER_DATA: 'UPDATE_MASTER_DATA',
  UPDATE_CAPABILITIES: 'UPDATE_CAPABILITIES',
  ACTIVATE: 'ACTIVATE',
  DEACTIVATE: 'DEACTIVATE',
  ARCHIVE: 'ARCHIVE',
  RESTORE: 'RESTORE',
  SET_PRIMARY: 'SET_PRIMARY',
  GENERIC_STATUS_PATCH: 'GENERIC_STATUS_PATCH',
  BOOKING_PICKUP: 'BOOKING_PICKUP',
  BOOKING_RETURN: 'BOOKING_RETURN',
  HISTORICAL_READ: 'HISTORICAL_READ',
} as const;

export type StationLifecycleCommand =
  (typeof StationLifecycleCommand)[keyof typeof StationLifecycleCommand];

export const StationLifecycleReasonCode = {
  STATION_ARCHIVED: 'STATION_ARCHIVED',
  STATION_INACTIVE: 'STATION_INACTIVE',
  STATION_NOT_ACTIVE: 'STATION_NOT_ACTIVE',
  PICKUP_DISABLED: 'PICKUP_DISABLED',
  RETURN_DISABLED: 'RETURN_DISABLED',
  STATUS_CHANGE_VIA_GENERIC_UPDATE_FORBIDDEN:
    'STATUS_CHANGE_VIA_GENERIC_UPDATE_FORBIDDEN',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  PRIMARY_ARCHIVE_REQUIRES_SUCCESSOR: 'PRIMARY_ARCHIVE_REQUIRES_SUCCESSOR',
  SUCCESSOR_PRIMARY_NOT_ACTIVE: 'SUCCESSOR_PRIMARY_NOT_ACTIVE',
  SUCCESSOR_PRIMARY_IS_SELF: 'SUCCESSOR_PRIMARY_IS_SELF',
  SET_PRIMARY_ON_ARCHIVED: 'SET_PRIMARY_ON_ARCHIVED',
  SET_PRIMARY_ON_INACTIVE: 'SET_PRIMARY_ON_INACTIVE',
  CAPABILITY_CHANGE_ON_ARCHIVED: 'CAPABILITY_CHANGE_ON_ARCHIVED',
  CAPABILITY_CHANGE_ON_INACTIVE: 'CAPABILITY_CHANGE_ON_INACTIVE',
  CREATE_WITH_ARCHIVED_STATUS: 'CREATE_WITH_ARCHIVED_STATUS',
  ALREADY_ARCHIVED: 'ALREADY_ARCHIVED',
  NOT_ARCHIVED: 'NOT_ARCHIVED',
  ARCHIVED_INVARIANT_VIOLATION: 'ARCHIVED_INVARIANT_VIOLATION',
} as const;

export type StationLifecycleReasonCode =
  (typeof StationLifecycleReasonCode)[keyof typeof StationLifecycleReasonCode];

export const StationLifecycleRequiredActionCode = {
  SET_SUCCESSOR_PRIMARY: 'SET_SUCCESSOR_PRIMARY',
  TRANSFER_PRIMARY_BEFORE_ARCHIVE: 'TRANSFER_PRIMARY_BEFORE_ARCHIVE',
  ACTIVATE_STATION_FIRST: 'ACTIVATE_STATION_FIRST',
  USE_LIFECYCLE_COMMAND: 'USE_LIFECYCLE_COMMAND',
  REVIEW_CAPABILITIES_AFTER_RESTORE: 'REVIEW_CAPABILITIES_AFTER_RESTORE',
  APPLY_ARCHIVED_INVARIANTS: 'APPLY_ARCHIVED_INVARIANTS',
  CLEAR_ARCHIVED_AT: 'CLEAR_ARCHIVED_AT',
} as const;

export type StationLifecycleRequiredActionCode =
  (typeof StationLifecycleRequiredActionCode)[keyof typeof StationLifecycleRequiredActionCode];

export const StationLifecycleWarningCode = {
  ACTIVE_BOOKINGS_ON_ARCHIVE: 'ACTIVE_BOOKINGS_ON_ARCHIVE',
  RESTORE_CAPABILITIES_REMAIN_DISABLED: 'RESTORE_CAPABILITIES_REMAIN_DISABLED',
  RESTORE_DOES_NOT_REENABLE_CAPABILITIES: 'RESTORE_DOES_NOT_REENABLE_CAPABILITIES',
  INACTIVE_HISTORICAL_READ: 'INACTIVE_HISTORICAL_READ',
  ARCHIVED_HISTORICAL_READ: 'ARCHIVED_HISTORICAL_READ',
  IDEMPOTENT_ARCHIVE: 'IDEMPOTENT_ARCHIVE',
  IDEMPOTENT_ACTIVATE: 'IDEMPOTENT_ACTIVATE',
  IDEMPOTENT_DEACTIVATE: 'IDEMPOTENT_DEACTIVATE',
} as const;

export type StationLifecycleWarningCode =
  (typeof StationLifecycleWarningCode)[keyof typeof StationLifecycleWarningCode];

export interface StationLifecycleReason {
  code: StationLifecycleReasonCode;
  message: string;
}

export interface StationLifecycleWarning {
  code: StationLifecycleWarningCode;
  message: string;
}

export interface StationLifecycleRequiredAction {
  code: StationLifecycleRequiredActionCode;
  message: string;
}

export interface StationLifecycleSnapshot {
  id?: string;
  status: StationStatus;
  isPrimary: boolean;
  pickupEnabled: boolean;
  returnEnabled: boolean;
  archivedAt?: Date | string | null;
}

export interface StationLifecycleContext {
  successorPrimaryStationId?: string | null;
  successorPrimaryStationStatus?: StationStatus | null;
  activeBookingCount?: number;
  proposedStatus?: StationStatus;
  nextPickupEnabled?: boolean;
  nextReturnEnabled?: boolean;
  restorePickupEnabled?: boolean;
  restoreReturnEnabled?: boolean;
  createStatus?: StationStatus;
}

export interface StationLifecycleMutations {
  status?: StationStatus;
  isPrimary?: boolean;
  pickupEnabled?: boolean;
  returnEnabled?: boolean;
  archivedAt?: Date | null;
}

export interface StationLifecycleEvaluation {
  allowed: boolean;
  blockingReasons: StationLifecycleReason[];
  warnings: StationLifecycleWarning[];
  requiredActions: StationLifecycleRequiredAction[];
  enforcedMutations?: StationLifecycleMutations;
}

export interface StationLifecycleEvaluationInput {
  command: StationLifecycleCommand;
  station: StationLifecycleSnapshot;
  context?: StationLifecycleContext;
}
