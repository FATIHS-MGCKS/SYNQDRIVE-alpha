import type { HandoverKind, HandoverSessionStatus } from '@prisma/client';

/** Implicit pre-session state — not persisted in DB. */
export const HANDOVER_SESSION_NOT_STARTED = 'NOT_STARTED' as const;

export type HandoverSessionLifecycleStatus =
  | typeof HANDOVER_SESSION_NOT_STARTED
  | HandoverSessionStatus;

export const HANDOVER_SESSION_STATUSES = [
  'DRAFT',
  'IN_PROGRESS',
  'AWAITING_REQUIREMENTS',
  'AWAITING_SIGNATURE',
  'SUBMITTED',
  'COMPLETED',
  'CANCELLED',
  'SUPERSEDED',
] as const satisfies readonly HandoverSessionStatus[];

export const HANDOVER_SESSION_TERMINAL_STATUSES = [
  'COMPLETED',
  'CANCELLED',
  'SUPERSEDED',
] as const satisfies readonly HandoverSessionStatus[];

export const HANDOVER_SESSION_ACTIVE_STATUSES = [
  'DRAFT',
  'IN_PROGRESS',
  'AWAITING_REQUIREMENTS',
  'AWAITING_SIGNATURE',
  'SUBMITTED',
] as const satisfies readonly HandoverSessionStatus[];

export const HANDOVER_SESSION_IMMUTABLE_STATUSES = HANDOVER_SESSION_TERMINAL_STATUSES;

export function isHandoverSessionTerminal(
  status: HandoverSessionLifecycleStatus,
): status is (typeof HANDOVER_SESSION_TERMINAL_STATUSES)[number] {
  return (HANDOVER_SESSION_TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function isHandoverSessionActive(
  status: HandoverSessionStatus,
): status is (typeof HANDOVER_SESSION_ACTIVE_STATUSES)[number] {
  return (HANDOVER_SESSION_ACTIVE_STATUSES as readonly string[]).includes(status);
}

export type HandoverSessionTransitionAction =
  | 'START'
  | 'ACQUIRE'
  | 'RELEASE'
  | 'SYNC_REQUIREMENTS'
  | 'SYNC_SIGNATURES'
  | 'SUBMIT'
  | 'CANCEL'
  | 'SUPERSEDE'
  | 'COMPLETE';

export interface HandoverSessionBlocker {
  code: string;
  message: string;
  overridable: boolean;
  category: 'booking' | 'vehicle' | 'scope' | 'permission' | 'gate' | 'eligibility' | 'signature' | 'document' | 'version' | 'protocol';
}

export interface HandoverSessionPermissionContext {
  canWriteBookings: boolean;
  canOverrideScope: boolean;
  canOverridePickupGate: boolean;
  canSupersede: boolean;
}

export interface HandoverSessionScopeContext {
  /** When false, scopeOverrideReason + canOverrideScope required to proceed. */
  stationWritable: boolean;
  actualStationId: string | null;
}

export interface HandoverSessionBookingSnapshot {
  status: string;
  vehicleId: string;
  pickupStationId: string | null;
  returnStationId: string | null;
  hasPickupProtocol: boolean;
  hasReturnProtocol: boolean;
}

export interface HandoverSessionVehicleSnapshot {
  status: string;
  rentalBlocked: boolean;
  blockingReasons: string[];
}

export interface HandoverSessionRequirementSnapshot {
  /** Pickup gate / eligibility / document blockers from server evaluation. */
  blockers: HandoverSessionBlocker[];
  pickupGateOverrideReason: string | null;
  eligibilityApprovalId: string | null;
}

export interface HandoverSessionPayloadSnapshot {
  documentsAcknowledged: boolean;
  customerSignatureDataUrl: string | null;
  customerSignatureName: string | null;
  staffSignatureDataUrl: string | null;
  staffSignatureName: string | null;
  odometerKm: number | null;
}

export interface HandoverSessionActorContext {
  userId: string;
  displayName: string | null;
  platformRole?: string | null;
  membershipRole?: string | null;
}

export interface HandoverTransitionEvaluateInput {
  organizationId: string;
  bookingId: string;
  kind: HandoverKind;
  fromStatus: HandoverSessionLifecycleStatus;
  toStatus: HandoverSessionStatus;
  action: HandoverSessionTransitionAction;
  expectedVersion: number | null;
  currentVersion: number | null;
  lockedByUserId: string | null;
  actor: HandoverSessionActorContext;
  permissions: HandoverSessionPermissionContext;
  scope: HandoverSessionScopeContext;
  scopeOverrideReason: string | null;
  cancelReason: string | null;
  supersedeReason: string | null;
  booking: HandoverSessionBookingSnapshot;
  vehicle: HandoverSessionVehicleSnapshot | null;
  existingCompletedProtocolId: string | null;
  requirements: HandoverSessionRequirementSnapshot;
  payload: HandoverSessionPayloadSnapshot;
}

export interface HandoverTransitionDecision {
  allowed: boolean;
  code?: string;
  reason?: string;
  blockers?: HandoverSessionBlocker[];
}

export interface HandoverSessionDto {
  id: string;
  organizationId: string;
  bookingId: string;
  vehicleId: string;
  kind: HandoverKind;
  status: HandoverSessionStatus;
  version: number;
  payload: Record<string, unknown> | null;
  blockingRequirements: HandoverSessionBlocker[];
  lockedByUserId: string | null;
  lockedAt: string | null;
  scopeOverrideReason: string | null;
  cancelReason: string | null;
  supersededById: string | null;
  completedProtocolId: string | null;
  submittedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}
