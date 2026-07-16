import type { DrivingCapabilityStatus } from '@prisma/client';

/** Why a capability refresh was requested — never triggers live trip FSM. */
export type CapabilityRefreshTrigger =
  | 'NEW_INTEGRATION'
  | 'HARDWARE_PROVIDER_CHANGE'
  | 'PERIODIC_STALE'
  | 'SIGNAL_LOSS_RETRY'
  | 'SIGNAL_REAPPEARED'
  | 'DIAGNOSTIC'
  | 'POST_TRIP_INIT';

export type CapabilityTransitionKind =
  | 'SIGNAL_LOST'
  | 'SIGNAL_RECOVERED'
  | 'STATUS_CHANGED'
  | 'PROVIDER_DEGRADED';

export type CapabilityTransition = {
  capabilityKey: string;
  kind: CapabilityTransitionKind;
  previousStatus: DrivingCapabilityStatus | null;
  nextStatus: DrivingCapabilityStatus;
  lossStreak: number;
};

export type CapabilityRefreshResult = {
  ran: boolean;
  trigger: CapabilityRefreshTrigger;
  skippedReason?: string;
  probesWritten: number;
  capabilityVersion: string;
  checkedAt: string;
  transitions: CapabilityTransition[];
  detectorCapabilityChanged: boolean;
  detectorCapabilityFingerprint: string | null;
  previousDetectorCapabilityFingerprint: string | null;
};

export type CapabilityRefreshRequest = {
  organizationId: string;
  vehicleId: string;
  trigger: CapabilityRefreshTrigger;
  force?: boolean;
};
