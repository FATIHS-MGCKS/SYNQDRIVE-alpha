import {
  DeviceConnectionPhysicalAuthorityMode,
  Prisma,
} from '@prisma/client';
import type { PhysicalAuthorityScope } from './device-connection-physical-authority-cutover.repository';

/** Structural legacy OBD persistence exclusion when persisted authority is PHYSICAL. */
export function isLegacyObdPersistenceExcludedByAuthority(
  authorityMode: DeviceConnectionPhysicalAuthorityMode,
): boolean {
  return authorityMode === DeviceConnectionPhysicalAuthorityMode.PHYSICAL;
}

/** Cutover activation gate outcomes — never silently coerced to ELIGIBLE. */
export enum PhysicalStateCutoverEligibilityStatus {
  ELIGIBLE = 'ELIGIBLE',
  ALREADY_PHYSICAL = 'ALREADY_PHYSICAL',
  BLOCKED_TARGET_PRESEED_NOT_PROVEN = 'BLOCKED_TARGET_PRESEED_NOT_PROVEN',
  BLOCKED_UNEXPLAINED_DIVERGENCES = 'BLOCKED_UNEXPLAINED_DIVERGENCES',
  BLOCKED_MIXED_REPLICA = 'BLOCKED_MIXED_REPLICA',
  BLOCKED_RUNTIME_NOT_READY = 'BLOCKED_RUNTIME_NOT_READY',
  BLOCKED_OTHER_SAFETY_GATE = 'BLOCKED_OTHER_SAFETY_GATE',
}

export type PhysicalStateCutoverActivationEvidence = {
  targetPreseedDryRunProven?: boolean;
  unexplainedDivergencesZeroProven?: boolean;
  mixedReplicaGateProven?: boolean;
  runtimeReady?: boolean;
};

export type PhysicalStateCutoverEligibilityResult = {
  status: PhysicalStateCutoverEligibilityStatus;
  scope: PhysicalAuthorityScope;
  currentAuthorityMode: DeviceConnectionPhysicalAuthorityMode;
  blockingReasons: string[];
};

export type PhysicalStateAuthorityLatchAttemptResult =
  | {
      outcome: 'LATCHED';
      scope: PhysicalAuthorityScope;
      authorityMode: 'PHYSICAL';
      latchedAt: Date;
      rowId: string;
    }
  | {
      outcome: 'ALREADY_PHYSICAL';
      scope: PhysicalAuthorityScope;
      authorityMode: 'PHYSICAL';
      latchedAt: Date | null;
      rowId: string;
    }
  | {
      outcome: 'BLOCKED';
      scope: PhysicalAuthorityScope;
      eligibility: PhysicalStateCutoverEligibilityResult;
    };

export type PhysicalStateAuthorityCutoverInput = {
  scope: PhysicalAuthorityScope;
  latchedBy?: string | null;
  evidenceSnapshot?: Prisma.InputJsonValue;
  activationEvidence?: PhysicalStateCutoverActivationEvidence;
};
