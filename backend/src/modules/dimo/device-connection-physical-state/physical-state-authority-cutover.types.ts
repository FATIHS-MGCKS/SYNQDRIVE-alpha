import { DeviceConnectionPhysicalAuthorityMode } from '@prisma/client';
import type { PhysicalAuthorityScope } from './device-connection-physical-authority-cutover.repository';
import type { SignedPhysicalStateCutoverEvidenceBundle } from './physical-state-cutover-evidence.types';

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
  BLOCKED_EVIDENCE_PROVENANCE = 'BLOCKED_EVIDENCE_PROVENANCE',
  BLOCKED_OTHER_SAFETY_GATE = 'BLOCKED_OTHER_SAFETY_GATE',
}

export type PhysicalStateCutoverEligibilityResult = {
  status: PhysicalStateCutoverEligibilityStatus;
  scope: PhysicalAuthorityScope;
  currentAuthorityMode: DeviceConnectionPhysicalAuthorityMode;
  blockingReasons: string[];
  evidenceVerificationStatus?: string;
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

/**
 * Production cutover input — caller supplies a signed evidence bundle only.
 * Boolean activation proof and caller-provided evidence snapshots are not accepted.
 */
export type PhysicalStateAuthorityCutoverInput = {
  scope: PhysicalAuthorityScope;
  latchedBy?: string | null;
  signedEvidenceBundle?: SignedPhysicalStateCutoverEvidenceBundle | null;
};
