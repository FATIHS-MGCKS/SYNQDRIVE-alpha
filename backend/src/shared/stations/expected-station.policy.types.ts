import type { StationStatus } from '@prisma/client';

export const EXPECTED_STATION_POLICY_VERSION = 1 as const;

export const ExpectedStationOrigin = {
  PLANNED_TRANSFER: 'PLANNED_TRANSFER',
  CONFIRMED_ONE_WAY_RETURN: 'CONFIRMED_ONE_WAY_RETURN',
  PLANNED_REPOSITIONING: 'PLANNED_REPOSITIONING',
  OPERATIONAL_GOAL: 'OPERATIONAL_GOAL',
} as const;

export type ExpectedStationOrigin =
  (typeof ExpectedStationOrigin)[keyof typeof ExpectedStationOrigin];

export const ExpectedStationTransferStatus = {
  PLANNED: 'PLANNED',
  IN_TRANSIT: 'IN_TRANSIT',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type ExpectedStationTransferStatus =
  (typeof ExpectedStationTransferStatus)[keyof typeof ExpectedStationTransferStatus];

export const ExpectedStationRequestChannel = {
  COMMAND: 'COMMAND',
  UI_DIRECT_FIELD: 'UI_DIRECT_FIELD',
  HOME_MUTATION: 'HOME_MUTATION',
} as const;

export type ExpectedStationRequestChannel =
  (typeof ExpectedStationRequestChannel)[keyof typeof ExpectedStationRequestChannel];

export const ExpectedStationClearReason = {
  DESTINATION_REACHED: 'DESTINATION_REACHED',
  TRANSFER_COMPLETED: 'TRANSFER_COMPLETED',
  TRANSFER_CANCELLED: 'TRANSFER_CANCELLED',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
  MANUAL_OVERRIDE: 'MANUAL_OVERRIDE',
} as const;

export type ExpectedStationClearReason =
  (typeof ExpectedStationClearReason)[keyof typeof ExpectedStationClearReason];

export const ExpectedStationPolicyIssueCode = {
  SOURCE_REQUIRED: 'EXPECTED_SOURCE_REQUIRED',
  TIMESTAMP_REQUIRED: 'EXPECTED_TIMESTAMP_REQUIRED',
  CONTEXT_REQUIRED: 'EXPECTED_CONTEXT_REQUIRED',
  UI_DIRECT_FIELD_FORBIDDEN: 'EXPECTED_UI_DIRECT_FIELD_FORBIDDEN',
  HOME_MUTATION_MUST_NOT_TOUCH_EXPECTED: 'EXPECTED_HOME_MUTATION_MUST_NOT_TOUCH_EXPECTED',
  TARGET_STATION_ARCHIVED: 'EXPECTED_TARGET_STATION_ARCHIVED',
  TARGET_STATION_INACTIVE: 'EXPECTED_TARGET_STATION_INACTIVE',
  ACTIVE_TRANSFER_PRIORITY: 'EXPECTED_ACTIVE_TRANSFER_PRIORITY',
  LOWER_PRIORITY_CONFLICT: 'EXPECTED_LOWER_PRIORITY_CONFLICT',
  STALE_CONTEXT_RECONCILIATION_ONLY: 'EXPECTED_STALE_CONTEXT_RECONCILIATION_ONLY',
  CLEAR_REASON_REQUIRED: 'EXPECTED_CLEAR_REASON_REQUIRED',
  DESTINATION_NOT_FULFILLED: 'EXPECTED_DESTINATION_NOT_FULFILLED',
  IDEMPOTENT_NOOP: 'EXPECTED_IDEMPOTENT_NOOP',
} as const;

export type ExpectedStationPolicyIssueCode =
  (typeof ExpectedStationPolicyIssueCode)[keyof typeof ExpectedStationPolicyIssueCode];

export interface ExpectedStationPolicyIssue {
  code: ExpectedStationPolicyIssueCode | string;
  message: string;
}

export interface ExpectedStationContextRef {
  transferId?: string | null;
  bookingId?: string | null;
  reasonCode?: string | null;
  transferStatus?: ExpectedStationTransferStatus | null;
}

export interface ExpectedStationSnapshot {
  expectedStationId: string | null;
  expectedStationSource: ExpectedStationOrigin | string | null;
  expectedStationSetAt: Date | string | null;
  context?: ExpectedStationContextRef | null;
}

export interface ExpectedStationPolicyEvaluation {
  allowed: boolean;
  idempotent: boolean;
  blockingReasons: ExpectedStationPolicyIssue[];
  warnings: ExpectedStationPolicyIssue[];
}

export interface ExpectedStationReconciliationEvaluation {
  stale: boolean;
  recommendedAction: 'NONE' | 'MARK_FOR_RECONCILIATION';
  blockingReasons: ExpectedStationPolicyIssue[];
}

export interface SetExpectedStationPolicyInput {
  targetStationId: string;
  origin: ExpectedStationOrigin;
  sourceSetAt: Date | string;
  context: ExpectedStationContextRef;
  targetStationStatus?: StationStatus | null;
  existing?: ExpectedStationSnapshot | null;
  requestChannel?: ExpectedStationRequestChannel;
}

export interface ClearExpectedStationPolicyInput {
  clearReason: ExpectedStationClearReason;
  clearedAt: Date | string;
  expectedStationId: string | null;
  actualArrivalStationId?: string | null;
  currentStationId?: string | null;
  requestChannel?: ExpectedStationRequestChannel;
}

export interface HomeMutationExpectedInvariantInput {
  touchesExpectedStationId?: boolean;
  touchesExpectedStationSource?: boolean;
  touchesExpectedStationSetAt?: boolean;
}
